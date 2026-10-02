import Link from "next/link";
import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { canAccess } from "@/lib/modules";
import {
  laborContextSchema,
  laborReport,
  laborIssueLabels,
} from "@/lib/labor-report";
import { LaborConfigForm } from "@/components/labor-config-form";
import { Input } from "@/components/ui/input";
export default async function Labor({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { companyId } = await params,
    { db, member } = await requireModule(companyId, "horasfix"),
    search = await searchParams;
  if (
    !["owner", "admin"].includes(member.role) ||
    !["gastos", "trabajadores", "fin-proyectos"].every((m) =>
      canAccess(member, m),
    )
  )
    notFound();
  const contextResult = await db.rpc("labor_context", { p_company: companyId });
  if (contextResult.error)
    throw new Error(
      "No se pudo consultar Labor. No se muestran totales parciales.",
    );
  const context = laborContextSchema.parse(contextResult.data),
    report = laborReport(context),
    write = canAccess(member, "horasfix", "write");
  const [ratesResult, termsResult, settingsResult, projectsResult] =
    await Promise.all([
      db
        .from("labor_rates")
        .select("*")
        .eq("company_id", companyId)
        .order("starts_on", { ascending: false }),
      db.from("labor_project_terms").select("*").eq("company_id", companyId),
      db
        .from("labor_settings")
        .select("*")
        .eq("company_id", companyId)
        .maybeSingle(),
      db.from("projects").select("id,estimate_id").eq("company_id", companyId),
    ]);
  if (
    ratesResult.error ||
    termsResult.error ||
    settingsResult.error ||
    projectsResult.error
  )
    throw new Error("No se pudo cargar la configuración de Labor.");
  const estimateIds = [
    ...new Set(
      (projectsResult.data ?? []).map((p) => p.estimate_id).filter(Boolean),
    ),
  ];
  const estimates = estimateIds.length
    ? await db
        .from("estimates")
        .select("id,version")
        .eq("company_id", companyId)
        .in("id", estimateIds)
    : { data: [], error: null };
  if (estimates.error)
    throw new Error("No se pudieron consultar las revisiones de estimados.");
  const versionFor = (project: string) => {
    const eid = projectsResult.data?.find((p) => p.id === project)?.estimate_id;
    return estimates.data?.find((e) => e.id === eid)?.version ?? 0;
  };
  const workerOptions = Object.entries(context.names.workers).sort((a, b) =>
    a[1].localeCompare(b[1], "es"),
  );
  const projectOptions = Object.entries(context.names.projects).sort((a, b) =>
    a[1].localeCompare(b[1], "es"),
  );
  const terms = termsResult.data ?? [],
    unconfigured = projectOptions.filter(
      ([id]) => !terms.some((t) => t.id === id),
    ),
    settings = settingsResult.data;
  const money = new Intl.NumberFormat("es-US", {
      style: "currency",
      currency: "USD",
    }),
    usd = (cents: number) => money.format(cents / 100);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: context.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  function rateFields(values?: Record<string, unknown>) {
    return (
      <>
        <label className="field">
          Trabajador
          <select
            name="worker"
            required
            defaultValue={String(values?.worker_id ?? "")}
            disabled={!!values}
          >
            <option value="">Selecciona</option>
            {workerOptions.map(([id, name]) => (
              <option value={id} key={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        {values && (
          <input type="hidden" name="worker" value={String(values.worker_id)} />
        )}
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="field">
            Vigente desde
            <Input
              type="date"
              name="from"
              required
              defaultValue={String(values?.starts_on ?? today)}
            />
          </label>
          <label className="field">
            Vigente hasta
            <Input
              type="date"
              name="to"
              defaultValue={String(values?.ends_on ?? "")}
            />
          </label>
        </div>
        <label className="field">
          Tarifa diaria (USD)
          <Input
            type="number"
            name="amount"
            step="0.01"
            min="0.01"
            required
            defaultValue={values ? String(values.amount) : ""}
          />
        </label>
        <label className="flex gap-2">
          <input
            type="checkbox"
            name="active"
            defaultChecked={values ? Boolean(values.active) : true}
          />
          Tarifa activa
        </label>
      </>
    );
  }
  function projectFields(values?: Record<string, unknown>) {
    const target = String(values?.id ?? "");
    return (
      <>
        {values ? (
          <>
            <p className="font-semibold">{context.names.projects[target]}</p>
            <input type="hidden" name="target" value={target} />
          </>
        ) : (
          <label className="field">
            Proyecto
            <select name="target" required defaultValue="">
              <option value="">Selecciona</option>
              {unconfigured.map(([id, name]) => (
                <option value={id} key={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="field">
          Modo de Labor
          <select name="mode" defaultValue={String(values?.mode ?? "day")}>
            <option value="day">Por jornada, a cargo de la empresa</option>
            <option value="adjustment">
              Ajuste acordado, cuadrilla incluida
            </option>
          </select>
        </label>
        <p className="text-sm">
          Para un ajuste, completa responsable, importe, fecha y revisión del
          estimado. La tarifa diaria de la cuadrilla no se añade al ajuste.
        </p>
        <label className="field">
          Responsable del ajuste
          <select
            name="responsible"
            defaultValue={String(values?.responsible_id ?? "")}
          >
            <option value="">Selecciona para un ajuste</option>
            {workerOptions.map(([id, name]) => (
              <option value={id} key={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="field">
            Importe del ajuste (USD)
            <Input
              type="number"
              name="amount"
              step="0.01"
              min="0.01"
              defaultValue={String(values?.amount ?? "")}
            />
          </label>
          <label className="field">
            Fecha del costo
            <Input
              type="date"
              name="date"
              defaultValue={String(values?.cost_date ?? "")}
            />
          </label>
        </div>
        <label className="field">
          Revisión guardada del estimado
          <Input
            type="number"
            name="estimate_version"
            min="1"
            step="1"
            defaultValue={
              values
                ? String(values.estimate_version ?? (versionFor(target) || ""))
                : ""
            }
          />
        </label>
        <p className="text-sm">
          Consulta la revisión en el estimado del proyecto. El acuerdo conserva
          esa revisión aunque después cambie el catálogo.
        </p>
        <label className="flex gap-2">
          <input
            type="checkbox"
            name="active"
            defaultChecked={values ? Boolean(values.active) : true}
          />
          Configuración activa
        </label>
      </>
    );
  }
  return (
    <>
      <p className="eyebrow">Equipo y costos</p>
      <h1 className="page-title mt-2">Labor por jornada y proyecto</h1>
      <nav className="flex flex-wrap gap-5 my-5">
        <Link className="underline" href={`/app/${companyId}/horas`}>
          Horas
        </Link>
        <Link className="underline" href={`/app/${companyId}/gastos`}>
          Gastos
        </Link>
      </nav>
      <p>
        El costo calculado no confirma una nómina ni un pago. Los turnos y las
        tarifas guardadas son la base de esta consulta.
      </p>
      {search.saved && (
        <p className="card my-4" role="status">
          Configuración guardada. Los costos se recalcularon con las vigencias y
          acuerdos actuales.
        </p>
      )}
      <section className="card my-5 min-w-0">
        <h2 className="font-semibold text-lg">
          Costo conocido de Labor: {usd(report.knownCostCents)}
        </h2>
        <p>
          Costos anteriores conciliados {usd(report.historicalCostCents)} ·
          Suplemento calculado {usd(report.supplementCostCents)} · Costos
          anteriores pendientes de correspondencia{" "}
          {usd(report.unmappedCostCents)}
        </p>
        <p className="mt-3">
          {report.complete
            ? "Sin incidencias en esta consulta."
            : "Consulta incompleta: revisa las incidencias antes de considerar conciliado el costo."}
        </p>
      </section>
      {!!report.pending.length && (
        <section
          className="card my-5 min-w-0"
          aria-label="Incidencias de Labor"
        >
          <h2 className="font-semibold text-lg">
            Pendientes de revisión ({report.pending.length})
          </h2>
          <ul className="list-disc pl-5 space-y-2 mt-3">
            {report.pending.map((i, n) => (
              <li key={n}>
                {i.date ?? "Fecha pendiente"} ·{" "}
                {i.workerId
                  ? (context.names.workers[i.workerId] ??
                    "Trabajador pendiente")
                  : ""}{" "}
                ·{" "}
                {i.projectId
                  ? (context.names.projects[i.projectId] ??
                    "Proyecto pendiente")
                  : "Proyecto por conciliar"}{" "}
                ·{" "}
                {laborIssueLabels[i.reason] ??
                  "Información pendiente de revisión."}
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="card my-5 min-w-0">
        <h2 className="font-semibold text-lg">
          Costos calculados ({report.supplements.length})
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm my-3">
            <caption className="sr-only">
              Labor calculada por fecha, trabajador y proyecto
            </caption>
            <thead>
              <tr>
                {["Fecha", "Trabajador", "Proyecto", "Origen", "Costo"].map(
                  (h) => (
                    <th key={h} scope="col" className="text-left p-2">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {report.supplements.map((c) => (
                <tr key={c.id}>
                  <td className="p-2">{c.date}</td>
                  <td className="p-2">{context.names.workers[c.workerId]}</td>
                  <td className="p-2">
                    <Link
                      className="underline"
                      href={`/app/${companyId}/proyectos/${c.projectId}`}
                    >
                      {context.names.projects[c.projectId]}
                    </Link>
                  </td>
                  <td className="p-2">
                    {c.kind === "DAILY"
                      ? "Jornada"
                      : "Ajuste · cuadrilla incluida"}
                  </td>
                  <td className="p-2 whitespace-nowrap">
                    {usd(c.amountCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <details className="card my-5 min-w-0">
        <summary className="font-semibold cursor-pointer">
          Configurar tarifas y acuerdos
        </summary>
        <p className="my-4">
          Guardar no paga ni crea una copia de gasto. Cada cambio conserva
          actor, motivo y revisión.
        </p>
        <div className="grid lg:grid-cols-2 gap-5">
          <section className="min-w-0">
            <h2 className="font-semibold mb-3">Nueva tarifa diaria</h2>
            <LaborConfigForm
              company={companyId}
              kind="RATE"
              id={randomUUID()}
              version={0}
              request={randomUUID()}
              disabled={!write}
            >
              {rateFields()}
            </LaborConfigForm>
          </section>
          <section className="min-w-0">
            <h2 className="font-semibold mb-3">Proyecto sin configurar</h2>
            <LaborConfigForm
              company={companyId}
              kind="PROJECT"
              id={randomUUID()}
              version={0}
              request={randomUUID()}
              disabled={!write || !unconfigured.length}
            >
              {projectFields()}
            </LaborConfigForm>
          </section>
        </div>
        <section className="mt-7">
          <h2 className="font-semibold mb-3">Jornadas compartidas</h2>
          <LaborConfigForm
            company={companyId}
            kind="SETTINGS"
            id={companyId}
            version={settings?.version ?? 0}
            request={randomUUID()}
            disabled={!write}
          >
            <label className="field">
              Regla de reparto
              <select
                name="shared_day_rule"
                defaultValue={settings?.shared_day_rule ?? "review"}
              >
                <option value="review">Mantener pendiente hasta revisar</option>
                <option value="minutes">
                  Repartir por minutos netos confirmados
                </option>
              </select>
            </label>
          </LaborConfigForm>
        </section>
        {(ratesResult.data ?? []).map((rate) => (
          <details className="mt-6" key={`${rate.id}:${rate.version}`}>
            <summary className="cursor-pointer font-semibold">
              {context.names.workers[rate.worker_id]} · {rate.starts_on} ·{" "}
              {money.format(rate.amount)} · Revisión {rate.version}
            </summary>
            <div className="mt-3">
              <LaborConfigForm
                company={companyId}
                kind="RATE"
                id={rate.id}
                version={rate.version}
                request={randomUUID()}
                disabled={!write}
              >
                {rateFields(rate)}
              </LaborConfigForm>
            </div>
          </details>
        ))}
        {terms.map((term) => (
          <details className="mt-6" key={`${term.id}:${term.version}`}>
            <summary className="cursor-pointer font-semibold">
              {context.names.projects[term.id]} ·{" "}
              {term.mode === "day" ? "Jornada" : "Ajuste"} · Revisión{" "}
              {term.version}
            </summary>
            <div className="mt-3">
              <LaborConfigForm
                company={companyId}
                kind="PROJECT"
                id={term.id}
                version={term.version}
                request={randomUUID()}
                disabled={!write}
              >
                {projectFields(term)}
              </LaborConfigForm>
            </div>
          </details>
        ))}
      </details>
    </>
  );
}
