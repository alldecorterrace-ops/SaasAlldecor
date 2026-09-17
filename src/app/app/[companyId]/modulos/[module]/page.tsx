import { notFound } from "next/navigation";
import { Layers3 } from "lucide-react";
import { requireModule } from "@/lib/auth";
import { modules } from "@/lib/modules";
export default async function Pending({
  params,
}: {
  params: Promise<{ companyId: string; module: string }>;
}) {
  const { companyId, module } = await params;
  const entry = modules.find((m) => m.id === module);
  if (!entry || entry.ready) notFound();
  await requireModule(companyId, module);
  return (
    <>
      <p className="eyebrow">{entry.group}</p>
      <h1 className="page-title mt-3">{entry.label}</h1>
      <section className="card mt-8 max-w-2xl py-12">
        <Layers3 className="mb-5 size-9 text-primary" />
        <h2 className="text-xl font-semibold">
          Este módulo está en preparación
        </h2>
        <p className="mt-4 text-sm leading-7 text-muted-foreground">
          Forma parte del alcance completo. Sus operaciones, documentos y
          permisos deben implementarse y verificarse antes de estar disponibles
          aquí.
        </p>
        <p className="mt-4 text-sm leading-7 text-muted-foreground">
          Continúa utilizando ADT Admin para estas operaciones. La nueva
          plataforma todavía no ha recibido sus datos.
        </p>
      </section>
    </>
  );
}
