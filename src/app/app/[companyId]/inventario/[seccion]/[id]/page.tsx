import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { inventorySection } from "@/lib/inventory-server";
import {
  businessDate,
  quantity,
  usd,
  costUsd,
  todayAt,
  type Choices,
  type InvDoc,
  type Master,
  type StockGroup,
  type LotRow,
  type LedgerRow,
  type TeamRow,
} from "@/lib/inventory";
import { uuid } from "@/lib/validation";
import {
  DocCard,
  LotTable,
  HistoryTable,
  StockCard,
} from "@/components/inventory/cards";
import { DocumentForm } from "@/components/inventory/document-form";
import { FamilyForm } from "@/components/inventory/family-form";
import { MasterForm, LocationTeam } from "@/components/inventory/master-form";
import { InventoryForm } from "@/components/inventory/form";
import { Input } from "@/components/ui/input";
import { MinimumEditor, PurchaseCharges } from "@/components/inventory/extras";

function Pager({
  path,
  p,
  slot,
  total,
  query,
}: {
  path: string;
  p: number;
  slot: string;
  total: number | null;
  query: Record<string, string>;
}) {
  const link = (n: number) =>
    path + "?" + new URLSearchParams({ ...query, [slot]: String(n) });
  return (
    <nav className="flex flex-wrap gap-4 text-sm">
      <span>
        {total ?? 0} registros · Página {p}
      </span>
      {p > 1 && (
        <Link className="underline" href={link(p - 1)}>
          Anterior
        </Link>
      )}
      {p * 20 < (total ?? 0) && (
        <Link className="underline" href={link(p + 1)}>
          Siguiente
        </Link>
      )}
    </nav>
  );
}
function CostForm({
  company,
  slug,
  target,
  lot,
  variant,
  name,
  known,
}: {
  company: string;
  slug: string;
  target: string;
  lot: string;
  variant: string;
  name: string;
  known: boolean;
}) {
  return (
    <details>
      <summary className="underline cursor-pointer">
        {known ? "Corregir costo" : "Completar costo"} · {name}
      </summary>
      <InventoryForm
        company={company}
        slug={slug}
        operation="cost"
        request={randomUUID()}
        id={target}
        submit={known ? "Corregir costo" : "Completar costo"}
      >
        <input type="hidden" name="lot" value={lot} />
        <input type="hidden" name="variant" value={variant} />
        <label className="field">
          Costo unitario (USD)
          <Input name="cost" type="number" min="0" step=".0001" required />
        </label>
        <label className="field">
          {known ? "Motivo de la corrección" : "Nota (opcional)"}
          <Input name="reason" maxLength={2000} required={known} />
        </label>
      </InventoryForm>
    </details>
  );
}
export default async function Detail({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string; seccion: string; id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { companyId, seccion, id } = await params,
    {
      db,
      inventory: ctx,
      section,
      company,
    } = await inventorySection(companyId, seccion);
  const root = `/app/${companyId}/inventario`,
    list = root + "/" + seccion,
    path = list + "/" + id;
  const raw = await searchParams,
    query = Object.fromEntries(
      Object.entries(raw).filter(([, v]) => !!v),
    ) as Record<string, string>;
  const page = (key: string) =>
    Math.min(100000, Math.max(1, parseInt(query[key]) || 1));
  const back = (
    <Link href={list} className="text-sm underline">
      Volver a {section.label.toLowerCase()}
    </Link>
  );
  const isDoc = ["COMPRA", "TRASLADO", "AJUSTE"].includes(section.kind);
  if (id === "nuevo") {
    if (!ctx.writable) notFound();
    if (isDoc) {
      const action =
        section.kind === "COMPRA"
          ? "purchases.create"
          : section.kind === "TRASLADO"
            ? "transfers.create"
            : "adjustments.create";
      if (
        !ctx.active ||
        !ctx.locations.some((l) => l.active && l.actions.includes(action))
      )
        notFound();
      return (
        <div className="grid gap-5">
          {back}
          <h1 className="page-title">
            {section.kind === "COMPRA"
              ? "Nueva compra"
              : section.kind === "TRASLADO"
                ? "Nuevo traslado"
                : "Nuevo ajuste"}
          </h1>
          <div className="card">
            <DocumentForm
              company={companyId}
              section={section}
              ctx={ctx}
              request={randomUUID()}
              today={todayAt(company.timezone)}
            />
          </div>
        </div>
      );
    }
    if (section.kind === "FAMILY" && ctx.productCreate) {
      const { data, error } = await db.rpc("inventory_catalog_choices", {
        p_company: companyId,
      });
      if (error) throw new Error("No se pudo cargar el catálogo.");
      return (
        <div className="grid gap-5">
          {back}
          <h1 className="page-title">Nuevo producto</h1>
          <div className="card">
            <FamilyForm
              company={companyId}
              ctx={ctx}
              choices={data as Choices}
              request={randomUUID()}
            />
          </div>
        </div>
      );
    }
    if (
      (seccion === "proveedores" && ctx.supplierManage) ||
      (seccion === "ubicaciones" && ctx.manager)
    )
      return (
        <div className="grid gap-5">
          {back}
          <h1 className="page-title">
            {seccion === "ubicaciones" ? "Nueva ubicación" : "Nuevo proveedor"}
          </h1>
          <div className="card">
            <MasterForm
              company={companyId}
              slug={seccion as "ubicaciones" | "proveedores"}
            />
          </div>
        </div>
      );
    notFound();
  }
  if (!uuid.safeParse(id).success) notFound();
  const args = { p_company: companyId };
  if (isDoc) {
    const { data, error } = await db.rpc("inventory_document_rows", {
      ...args,
      p_kind: section.kind,
      p_id: id,
    });
    if (error) throw new Error("No se pudo cargar el documento.");
    const doc = (data as InvDoc[])[0];
    if (!doc) notFound();
    const d = doc.data,
      voidAction =
        section.kind === "COMPRA" ? "purchases.void" : "transfers.void";
    const canVoid =
      ctx.active &&
      ctx.writable &&
      !d.void &&
      section.kind !== "AJUSTE" &&
      [d.locationId, ...(d.destinationId ? [d.destinationId] : [])].every(
        (loc) =>
          ctx.locations.some(
            (l) => l.id === loc && l.actions.includes(voidAction),
          ),
      );
    const lotPage = page("lotes");
    const lots =
      section.kind === "COMPRA"
        ? await db
            .rpc(
              "inventory_remaining_lots",
              { ...args, p_document: id },
              { count: "exact" },
            )
            .range((lotPage - 1) * 20, lotPage * 20 - 1)
        : null;
    if (lots?.error) throw new Error("No se pudieron cargar los lotes.");
    return (
      <div className="grid gap-5">
        {back}
        <h1 className="page-title">
          {section.kind === "COMPRA"
            ? "Compra"
            : section.kind === "TRASLADO"
              ? "Traslado"
              : "Ajuste"}{" "}
          del {businessDate(doc.business_date)}
        </h1>
        <DocCard doc={doc} path={list} detail timezone={company.timezone} />
        {section.kind === "COMPRA" && ctx.costView && (
          <PurchaseCharges
            company={companyId}
            documentId={id}
            amount={query.gasto ?? ""}
            canWrite={ctx.costManage && !d.void}
          />
        )}
        {lots && (
          <section className="card grid gap-3">
            <h2>Lo que queda de esta compra</h2>
            <LotTable rows={(lots.data ?? []) as LotRow[]} root={root} />
            <Pager
              path={path}
              p={lotPage}
              slot="lotes"
              total={lots.count}
              query={query}
            />
          </section>
        )}
        {ctx.costManage && !d.void && d.lotId && (
          <section className="card grid gap-3">
            <h2>Costos del lote</h2>
            {d.lines
              .filter((l) => l.qty > 0)
              .map((l) => (
                <CostForm
                  key={l.variant}
                  company={companyId}
                  slug={seccion}
                  target={id}
                  lot={d.lotId!}
                  variant={l.variant}
                  name={l.name}
                  known={l.unitCost != null}
                />
              ))}
          </section>
        )}
        {canVoid && (
          <details className="card">
            <summary className="cursor-pointer">Anular documento</summary>
            <InventoryForm
              company={companyId}
              slug={seccion}
              operation="void"
              request={randomUUID()}
              id={id}
              submit="Confirmar anulación"
            >
              <label className="field">
                Motivo obligatorio
                <textarea required maxLength={2000} name="reason" />
              </label>
            </InventoryForm>
          </details>
        )}
      </div>
    );
  }
  if (section.kind === "STOCK") {
    const location = uuid.safeParse(query.sede).success ? query.sede : null,
      l = page("lotes"),
      h = page("historial");
    const filters = { ...args, p_variant: id, p_location: location };
    const [stock, lots, history] = await Promise.all([
      db.rpc("inventory_stock_rows", { ...filters, p_empty: true }),
      db
        .rpc("inventory_remaining_lots", filters, { count: "exact" })
        .range((l - 1) * 20, l * 20 - 1),
      db
        .rpc("inventory_history", filters, { count: "exact" })
        .order("id", { ascending: false })
        .range((h - 1) * 20, h * 20 - 1),
    ]);
    if (stock.error || lots.error || history.error) notFound();
    const row = (stock.data as StockGroup[])[0];
    if (!row) notFound();
    return (
      <div className="grid gap-5">
        {back}
        <h1 className="page-title">{row.data.variants[0].name}</h1>
        <form className="flex gap-2 items-end">
          <label className="field">
            Ubicación
            <select name="sede" defaultValue={location ?? ""}>
              <option value="">Todas mis ubicaciones</option>
              {ctx.locations.map((x) => (
                <option value={x.id} key={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          <button className="underline">Filtrar</button>
        </form>
        <StockCard row={row} path={list} />
        <MinimumEditor
          company={companyId}
          target={id}
          slug="existencias"
          ctx={ctx}
        />
        <section className="card grid gap-3">
          <h2>De qué compras es</h2>
          <LotTable rows={(lots.data ?? []) as LotRow[]} root={root} />
          {ctx.costManage &&
            (lots.data as LotRow[])
              .filter(
                (r, i, a) => a.findIndex((x) => x.lot_id === r.lot_id) === i,
              )
              .map((r) => (
                <CostForm
                  key={r.lot_id}
                  company={companyId}
                  slug={seccion}
                  target={id}
                  lot={r.lot_id}
                  variant={id}
                  name={r.label}
                  known={r.detail.unitCost != null}
                />
              ))}
          <Pager
            path={path}
            p={l}
            slot="lotes"
            total={lots.count}
            query={query}
          />
        </section>
        <section className="card grid gap-3">
          <h2>Historial de movimientos</h2>
          <HistoryTable
            rows={(history.data ?? []) as LedgerRow[]}
            root={root}
          />
          <Pager
            path={path}
            p={h}
            slot="historial"
            total={history.count}
            query={query}
          />
        </section>
      </div>
    );
  }
  const result = await db.rpc("inventory_master_rows", {
    ...args,
    p_kind: section.kind,
    p_id: id,
  });
  if (result.error) notFound();
  const row = (result.data as Master[])[0];
  if (!row) notFound();
  if (section.kind === "LOCATION") {
    const team = await db.rpc("inventory_location_team", {
      ...args,
      p_location: id,
    });
    if (team.error) throw new Error("No se pudo cargar el equipo.");
    return (
      <div className="grid gap-5">
        {back}
        <h1 className="page-title">{row.name}</h1>
        <section className="card">
          <MasterForm company={companyId} slug="ubicaciones" row={row} />
        </section>
        <LocationTeam
          company={companyId}
          location={row.id}
          team={(team.data ?? []) as TeamRow[]}
        />
      </div>
    );
  }
  if (section.kind === "SUPPLIER") {
    const l = page("lotes"),
      p = page("compras");
    const [lots, docs] = await Promise.all([
      db
        .rpc(
          "inventory_remaining_lots",
          { ...args, p_supplier: id },
          { count: "exact" },
        )
        .range((l - 1) * 20, l * 20 - 1),
      db
        .rpc(
          "inventory_document_rows",
          { ...args, p_kind: "COMPRA", p_supplier: id },
          { count: "exact" },
        )
        .order("business_date", { ascending: false })
        .order("id")
        .range((p - 1) * 20, p * 20 - 1),
    ]);
    if (lots.error || docs.error)
      throw new Error("No se pudo consultar el proveedor.");
    return (
      <div className="grid gap-5">
        {back}
        <h1 className="page-title">{row.name}</h1>
        <section className="card grid gap-2">
          <p>{row.data.active ? "Proveedor activo" : "Proveedor inactivo"}</p>
          <p>
            {[
              row.data.phone,
              row.data.email,
              row.data.address,
              row.data.tax_identifier,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p>{row.data.notes}</p>
          {ctx.supplierManage && (
            <details>
              <summary className="underline">Editar proveedor</summary>
              <MasterForm company={companyId} slug="proveedores" row={row} />
            </details>
          )}
        </section>
        <section className="card grid gap-3">
          <h2>Lo que queda de sus compras</h2>
          <LotTable rows={(lots.data ?? []) as LotRow[]} root={root} />
          <Pager
            path={path}
            p={l}
            slot="lotes"
            total={lots.count}
            query={query}
          />
        </section>
        {row.data.purchases != null && (
          <section className="grid gap-3">
            <h2>Compras de este proveedor</h2>
            {(docs.data as InvDoc[]).map((d) => (
              <DocCard key={d.id} doc={d} path={root + "/compras"} />
            ))}
            <Pager
              path={path}
              p={p}
              slot="compras"
              total={docs.count}
              query={query}
            />
          </section>
        )}
      </div>
    );
  }
  const choices = await db.rpc("inventory_catalog_choices", args);
  if (choices.error) throw new Error("No se pudo cargar el catálogo.");
  const catalog = choices.data as Choices;
  return (
    <div className="grid gap-5">
      {back}
      <h1 className="page-title">{row.name}</h1>
      <section className="card grid gap-3">
        <p>
          {row.data.code} · {row.data.category || "Sin categoría"} ·{" "}
          {row.data.unit} · {row.data.active ? "Activo" : "Inactivo"}
        </p>
        <p>{row.data.description}</p>
        {row.data.commercial && ctx.commercialView && (
          <Link
            className="text-primary underline"
            href={`/app/${companyId}/productos/${row.data.commercial.id}`}
          >
            Catálogo comercial · {row.data.commercial.name}
          </Link>
        )}
        {row.data.variants?.map((v) => (
          <div className="border-t pt-2" key={v.id}>
            <h2>{v.name}</h2>
            <p>
              {v.sku} · {v.barcode || "Sin código de barras"} · Precio{" "}
              {usd(v.price)} · {v.active ? "Activa" : "Inactiva"}
            </p>
            {ctx.costView && (
              <p>
                Última compra {costUsd(v.lastCost)} · Promedio conocido{" "}
                {costUsd(v.average)} · Margen sobre precio{" "}
                {v.price && v.lastCost != null
                  ? (
                      ((Number(v.price) - Number(v.lastCost)) /
                        Number(v.price)) *
                      100
                    ).toFixed(1) + "%"
                  : "Pendiente"}
                {v.pending
                  ? " · " + quantity(v.pending) + " pendientes de costo"
                  : ""}
              </p>
            )}
            {ctx.priceManage && (
              <details>
                <summary className="underline">Fijar precio</summary>
                <InventoryForm
                  company={companyId}
                  slug={seccion}
                  operation="price"
                  request={randomUUID()}
                  id={id}
                  submit="Guardar precio"
                >
                  <input type="hidden" name="variant" value={v.id} />
                  <label className="field">
                    Precio de venta (USD)
                    <Input
                      name="price"
                      type="number"
                      min="0"
                      step=".01"
                      defaultValue={v.price ?? ""}
                    />
                  </label>
                </InventoryForm>
              </details>
            )}
          </div>
        ))}
      </section>
      {ctx.locations.length > 0 && (
        <MinimumEditor
          company={companyId}
          target={id}
          slug="productos"
          ctx={ctx}
        />
      )}
      {ctx.catalogManage && (
        <>
          <details className="card">
            <summary className="underline">Editar producto y variantes</summary>
            <FamilyForm
              company={companyId}
              ctx={ctx}
              choices={catalog}
              row={row}
              request={randomUUID()}
            />
          </details>
          <details className="card">
            <summary className="underline">
              Opciones de características de la empresa
            </summary>
            <InventoryForm
              company={companyId}
              slug={seccion}
              operation="option"
              request={randomUUID()}
              id={id}
              submit="Guardar estado de la opción"
            >
              <label className="field">
                Opción
                <select name="option" required defaultValue="">
                  <option value="">Elegir opción</option>
                  {catalog.attributes.flatMap((a) =>
                    a.options.map((o) => (
                      <option key={o.id} value={o.id}>
                        {a.name} · {o.name} · {o.active ? "Activa" : "Inactiva"}
                      </option>
                    )),
                  )}
                </select>
              </label>
              <label className="field">
                Disponibilidad
                <select name="enabled">
                  <option value="false">
                    Desactivar para productos nuevos
                  </option>
                  <option value="true">Activar</option>
                </select>
              </label>
            </InventoryForm>
          </details>
        </>
      )}
    </div>
  );
}
