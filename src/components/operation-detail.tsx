import Link from "next/link";
import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { canAccess } from "@/lib/modules";
import { uuid } from "@/lib/validation";
import { todayInTimezone } from "@/lib/commercial";
import { workerFields, expenseFields } from "@/lib/operations";
import { OperationForm } from "./operation-form";
import { EntitySelect } from "./entity-select";
import { ExpenseReceipt } from "./expense-receipt";
import { TimeForm } from "./time-form";
import { Input } from "./ui/input";
export async function OperationDetail({
  companyId,
  kind,
  recordId,
  saved,
}: {
  companyId: string;
  kind: "workers" | "expenses";
  recordId: string;
  saved: boolean;
}) {
  const workers = kind === "workers",
    moduleId = workers ? "trabajadores" : "gastos",
    isNew = recordId === "nuevo";
  if (!isNew && !uuid.safeParse(recordId).success) notFound();
  const { db, member, company } = await requireModule(
    companyId,
    moduleId,
    isNew ? "write" : "read",
  );
  let record: Record<string, unknown> = workers
    ? {
        name: "",
        email: "",
        phone: "",
        job_title: "",
        team: "",
        hourly_rate: "0.00",
        weekly_target: 40,
        active: true,
        notes: "",
      }
    : {
        project_id: null,
        worker_id: null,
        expense_date: todayInTimezone(company.timezone),
        category: "",
        description: "",
        vendor: "",
        document_number: "",
        amount: "0.00",
        method: "TARJETA_EXTERNA",
        reimbursement_status: "NO_APLICA",
        status: "PENDIENTE",
        decision_note: "",
      };
  let id: string = randomUUID(),
    version = 0,
    url: string | null = null;
  if (!isNew) {
    const { data, error } = await db
      .from(kind)
      .select("*")
      .eq("company_id", companyId)
      .eq("id", recordId)
      .maybeSingle();
    if (error) throw new Error("No se pudo cargar la ficha.");
    if (!data) notFound();
    record = data;
    id = data.id;
    version = data.version;
    if (!workers && data.receipt_path) {
      const signed = await db.storage
        .from("expense-receipts")
        .createSignedUrl(data.receipt_path, 300);
      if (signed.error) throw new Error("No se pudo cargar el recibo.");
      url = signed.data.signedUrl;
    }
  }
  async function choice(table: "workers" | "projects", field: string) {
    const ref = record[field];
    if (!ref) return null;
    let name =
      table === "workers" ? "Trabajador vinculado" : "Proyecto vinculado";
    if (
      canAccess(member, table === "workers" ? "trabajadores" : "fin-proyectos")
    ) {
      const { data, error } = await db
        .from(table)
        .select("name")
        .eq("company_id", companyId)
        .eq("id", String(ref))
        .maybeSingle();
      if (error) throw new Error("No se pudo cargar la relación.");
      if (data) name = data.name;
    }
    return { id: String(ref), name };
  }
  const [project, worker] = workers
    ? [null, null]
    : await Promise.all([
        choice("projects", "project_id"),
        choice("workers", "worker_id"),
      ]);
  const readOnly = !canAccess(member, moduleId, "write"),
    manager = ["owner", "admin"].includes(member.role);
  return (
    <>
      <div className="mb-7">
        <p className="eyebrow">
          {workers ? "Equipo" : "Finanzas"} /{" "}
          {workers ? "Trabajadores" : "Gastos"}
        </p>
        <h1 className="page-title mt-2">
          {isNew
            ? workers
              ? "Nuevo trabajador"
              : "Nuevo gasto"
            : workers
              ? String(record.name)
              : `Gasto · ${record.expense_date}`}
        </h1>
      </div>
      <div className="flex gap-5 mb-6">
        <Link className="underline" href={`/app/${companyId}/${moduleId}`}>
          Volver al listado
        </Link>
        {!isNew && (
          <Link
            className="underline"
            href={`/app/${companyId}/historial/${kind}/${id}`}
          >
            Historial de cambios
          </Link>
        )}
      </div>
      {!workers && (
        <p className="text-sm mb-5 text-muted-foreground">
          Corregir los datos o el recibo de un gasto aprobado o rechazado lo
          devuelve a revisión. Los cambios y recibos anteriores se conservan.
        </p>
      )}
      <OperationForm
        key={`${id}:${version}`}
        companyId={companyId}
        kind={kind}
        id={id}
        version={version}
        initial={record}
        fields={workers ? workerFields : expenseFields}
        readOnly={readOnly}
        manager={manager}
        saved={saved}
      >
        {!workers && (
          <>
            <EntitySelect
              companyId={companyId}
              kind="projects"
              name="project_id"
              label="Proyecto"
              initial={project}
              canSearch={canAccess(member, "fin-proyectos") && !readOnly}
            />
            <EntitySelect
              companyId={companyId}
              kind="workers"
              name="worker_id"
              label="Trabajador"
              initial={worker}
              canSearch={canAccess(member, "trabajadores") && !readOnly}
            />
          </>
        )}
      </OperationForm>
      {!workers && !isNew && (
        <ExpenseReceipt
          key={`receipt:${version}`}
          companyId={companyId}
          id={id}
          version={version}
          url={url}
          readOnly={readOnly}
        />
      )}
      {workers && !isNew && manager && (
        <section className="card mt-6">
          <h2 className="font-semibold text-xl mb-3">
            Cuenta para marcar horas
          </h2>
          <p className="mb-4 text-sm">
            Vincula el correo de un usuario activo de esta empresa. Debe tener
            permiso de escritura en Horas. Dejarlo vacío retira la vinculación.
          </p>
          <p className="text-sm mb-4">
            Estado: {record.user_id ? "Cuenta vinculada" : "Sin vincular"}
          </p>
          <TimeForm
            key={`login:${version}`}
            companyId={companyId}
            operation="link"
            label="Guardar vinculación"
          >
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="version" value={version} />
            <label className="field">
              Correo de acceso
              <Input name="email" type="email" maxLength={254} />
            </label>
          </TimeForm>
        </section>
      )}
    </>
  );
}
