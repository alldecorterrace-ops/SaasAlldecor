import { randomUUID } from "node:crypto";
import { requireModule } from "@/lib/auth";
import { canAccess } from "@/lib/modules";
import { ActionForm } from "@/components/action-form";
import { AssistantForm } from "@/components/assistant-form";
import { configureAssistant } from "./actions";
export default async function Assistant({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params,
    { db, member } = await requireModule(companyId, "ia"),
    { data, error } = await db
      .from("assistant_settings")
      .select("enabled,daily_limit,updated_at")
      .eq("company_id", companyId)
      .maybeSingle();
  if (error) throw new Error("No se pudo cargar el asistente.");
  const configured = !!process.env.OPENAI_API_KEY;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">IA Assistant</h1>
      <p>
        Consultas sobre un resumen de la empresa, limitado por tus permisos.
        Cada consulta es independiente. Las respuestas pueden contener errores;
        los datos utilizados aparecen debajo para revisarlos.
      </p>
      <p>
        Proveedor: OpenAI ·{" "}
        {configured ? "Conexión configurada" : "Conexión pendiente"} ·{" "}
        {data?.enabled ? "Activado" : "Desactivado"}
      </p>
      <p className="text-sm">
        La consulta y los totales autorizados se envían a OpenAI. No se incluyen
        nombres de clientes, salarios ni documentos. Usa el asistente para
        análisis; no modifica registros. El proveedor puede cobrar consumo en la
        cuenta de API existente.
      </p>
      <AssistantForm
        companyId={companyId}
        requestId={randomUUID()}
        disabled={
          !configured || !data?.enabled || !canAccess(member, "ia", "write")
        }
      />
      {member.role !== "member" && (
        <ActionForm
          key={data?.updated_at ?? "new"}
          action={configureAssistant.bind(null, companyId)}
          label="Guardar configuración"
        >
          <h2 className="font-semibold">Control del administrador</h2>
          <label className="flex gap-2">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={data?.enabled ?? false}
            />
            Activar consultas para esta empresa
          </label>
          <label className="field">
            Máximo de consultas en 24 horas (toda la empresa)
            <input
              type="number"
              name="limit"
              required
              min={1}
              max={100}
              defaultValue={data?.daily_limit ?? 20}
            />
          </label>
          <p className="text-sm">
            Máximo adicional: 4 consultas por minuto por usuario. Los intentos
            fallidos también cuentan.
          </p>
        </ActionForm>
      )}
    </div>
  );
}
