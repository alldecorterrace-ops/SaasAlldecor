import { workspaces } from "@/lib/workspaces";

export type PrintableManual = {
  name: string;
  status: string;
  version: number;
  updated_at: string;
  data: Record<string, string>;
};

export function ManualPrint({
  record,
  companyName,
  timezone,
  projectName,
  documents,
}: {
  record: PrintableManual;
  companyName: string;
  timezone: string;
  projectName: string;
  documents: string[];
}) {
  const updated = new Intl.DateTimeFormat("es", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(record.updated_at));
  return (
    <article className="card estimate-print bg-white">
      <header className="border-b border-border pb-5 mb-6">
        <p className="eyebrow">{companyName} · Manual de fabricación</p>
        <h1 className="text-3xl font-semibold mt-3 break-words">
          {record.name}
        </h1>
        <p className="mt-3 font-semibold">
          {workspaces.manuals.statuses[record.status]} · Revisión{" "}
          {record.version}
        </p>
        <p className="mt-2">Proyecto: {projectName}</p>
        <p className="text-sm mt-2">
          Actualizado: {updated} ({timezone})
        </p>
        {record.status !== "APROBADO" && (
          <p className="mt-3 font-semibold">
            Esta revisión no está aprobada para fabricación.
          </p>
        )}
      </header>
      {workspaces.manuals.fields.map((field) => (
        <section className="mb-6" key={field.name}>
          <h2 className="text-lg font-semibold mb-2 print:break-after-avoid">
            {field.label}
          </h2>
          <p className="whitespace-pre-wrap break-words leading-relaxed">
            {record.data[field.name] || "Sin información registrada."}
          </p>
        </section>
      ))}
      <section>
        <h2 className="text-lg font-semibold mb-2 print:break-after-avoid">
          Documentos activos
        </h2>
        {documents.length ? (
          <>
            <ul className="list-disc pl-5 break-words">
              {documents.map((name, index) => (
                <li key={index}>{name}</li>
              ))}
            </ul>
            <p className="text-sm mt-2">
              Los archivos se consultan desde la ficha del manual; sus páginas
              no están incluidas en esta copia.
            </p>
          </>
        ) : (
          <p>Sin documentos activos.</p>
        )}
      </section>
    </article>
  );
}
