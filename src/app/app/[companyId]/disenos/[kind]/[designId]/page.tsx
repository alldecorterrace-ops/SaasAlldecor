import Link from "next/link";
import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { canAccess } from "@/lib/modules";
import { uuid } from "@/lib/validation";
import { designModule, initialDesign } from "@/lib/designs";
import { ActionForm } from "@/components/action-form";
import { DesignFields } from "@/components/design-fields";
import { designAction } from "../../actions";
export default async function Design({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string; kind: string; designId: string }>;
  searchParams: Promise<{ saved?: string; q?: string }>;
}) {
  const { companyId, kind, designId } = await params;
  if (!designModule(kind)) notFound();
  const fresh = designId === "nuevo";
  if (!fresh && !uuid.safeParse(designId).success) notFound();
  const { db, member } = await requireModule(companyId, kind),
    sp = await searchParams;
  const result = fresh
    ? { data: null, error: null }
    : await db
        .from("designs")
        .select("*")
        .eq("company_id", companyId)
        .eq("kind", kind)
        .eq("id", designId)
        .maybeSingle();
  if (result.error) throw new Error("No se pudo cargar el diseño.");
  if (!fresh && !result.data) notFound();
  const d = result.data,
    id = d?.id ?? randomUUID();
  const customers = canAccess(member, "clientes")
    ? await db
        .from("customers")
        .select("id,full_name")
        .eq("company_id", companyId)
        .eq("status", "active")
        .ilike(
          "full_name",
          `%${(sp.q ?? "").slice(0, 100).replace(/[\\%_]/g, "\\$&")}%`,
        )
        .order("full_name")
        .limit(50)
    : { data: [], error: null };
  if (customers.error) throw new Error("No se pudieron cargar clientes.");
  const choices: { id: string; full_name: string }[] = customers.data ?? [];
  if (d?.customer_id && !choices.some((c) => c.id === d.customer_id))
    choices.unshift({ id: d.customer_id, full_name: "Cliente actual" });
  const writable = canAccess(member, kind, "write");
  return (
    <div className="space-y-6">
      <Link href={`/app/${companyId}/disenos/${kind}`} className="underline">
        Volver a diseños
      </Link>
      <h1 className="text-2xl font-semibold">{d?.name ?? "Crear diseño"}</h1>
      {sp.saved && <p role="status">Diseño guardado.</p>}
      <form className="flex gap-3">
        <input
          name="q"
          placeholder="Buscar cliente antes de editar"
          defaultValue={sp.q ?? ""}
        />
        <button>Buscar cliente</button>
      </form>
      <p className="text-sm">
        Se muestran hasta 50 clientes. La búsqueda recarga el formulario; guarda
        antes de buscar otro cliente.
      </p>
      <ActionForm
        key={d?.version ?? 0}
        action={designAction.bind(null, companyId, kind, "save")}
        disabled={!writable}
      >
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="version" value={d?.version ?? 0} />
        <label className="field">
          Nombre
          <input
            name="name"
            required
            maxLength={160}
            defaultValue={d?.name ?? ""}
          />
        </label>
        <label className="field">
          Cliente
          <select
            name="customer_id"
            required
            defaultValue={d?.customer_id ?? ""}
          >
            <option value="">Seleccionar</option>
            {choices.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}
              </option>
            ))}
          </select>
        </label>
        <DesignFields
          initial={d?.spec ?? initialDesign}
          three={kind === "nuevo3d"}
        />
        {d && (
          <>
            <label className="flex gap-2">
              <input type="checkbox" name="refresh" />
              Recalcular con las tarifas actuales (conserva el historial
              anterior)
            </label>
            <label className="flex gap-2">
              <input
                type="checkbox"
                name="archived"
                defaultChecked={d.archived}
              />
              Archivar diseño
            </label>
          </>
        )}
      </ActionForm>
      {d && (
        <>
          <section className="card space-y-3">
            <h2 className="font-semibold">
              Cálculo guardado · revisión {d.version} · tarifas{" "}
              {d.price_version}
            </h2>
            <Link
              className="underline"
              href={`/app/${companyId}/historial/designs/${id}`}
            >
              Historial del diseño
            </Link>
            {d.items.map(
              (item: { name: string; line_total: string }, i: number) => (
                <p key={i}>
                  {item.name}: ${Number(item.line_total).toFixed(2)}
                </p>
              ),
            )}
            <p className="font-semibold">
              Total: ${Number(d.total).toFixed(2)} USD
            </p>
            <p className="text-sm">
              Sin impuestos ni descuentos. Puedes completarlos en el estimado.
            </p>
            {d.estimate_id && canAccess(member, "fin-estimados") && (
              <Link
                className="underline"
                href={`/app/${companyId}/estimados/${d.estimate_id}`}
              >
                Abrir último estimado generado
              </Link>
            )}
          </section>
          {writable &&
            !d.archived &&
            canAccess(member, "fin-estimados", "write") && (
              <ActionForm
                action={designAction.bind(null, companyId, kind, "estimate")}
                label="Generar estimado de esta revisión"
              >
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="version" value={d.version} />
                <input type="hidden" name="estimate_id" value={randomUUID()} />
                <p>
                  Genera un borrador con las medidas y precios guardados. Una
                  revisión nueva crea otro estimado sin sobrescribir el
                  anterior.
                </p>
              </ActionForm>
            )}
        </>
      )}
    </div>
  );
}
