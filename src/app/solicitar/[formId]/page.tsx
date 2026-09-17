import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { uuid } from "@/lib/validation";
import { ActionForm } from "@/components/action-form";
import { submitInquiry } from "./actions";
export const dynamic = "force-dynamic";
export default async function Inquiry({
  params,
}: {
  params: Promise<{ formId: string }>;
}) {
  const { formId } = await params;
  if (!uuid.safeParse(formId).success) notFound();
  const db = await createClient(),
    { data, error } = await db.rpc("web_form_info", { p_form: formId });
  if (error || !data) notFound();
  return (
    <main className="max-w-2xl mx-auto p-5 space-y-5">
      <h1 className="text-2xl font-semibold">Solicitar estimado · {data}</h1>
      <p>
        Cuéntanos sobre tu proyecto. Las medidas pueden ser aproximadas; escribe
        0 si no las conoces.
      </p>
      <ActionForm
        action={submitInquiry.bind(null, formId)}
        label="Enviar solicitud"
      >
        <input type="hidden" name="request_id" value={randomUUID()} />
        <div className="hidden" aria-hidden="true">
          <input name="website" tabIndex={-1} autoComplete="off" />
        </div>
        <label className="field">
          Nombre
          <input name="name" required minLength={2} maxLength={160} />
        </label>
        <label className="field">
          Correo
          <input type="email" name="email" required maxLength={254} />
        </label>
        <label className="field">
          Teléfono
          <input name="phone" maxLength={64} />
        </label>
        <label className="field">
          Servicio
          <select name="service">
            <option>Pérgola</option>
            <option>Cocina exterior</option>
            <option>Pared</option>
            <option>Otro</option>
          </select>
        </label>
        <div className="grid grid-cols-3 gap-3">
          {Object.entries({
            length: "Largo (ft)",
            width: "Ancho (ft)",
            height: "Altura (ft)",
          }).map(([k, label]) => (
            <label key={k} className="field">
              {label}
              <input
                name={k}
                type="number"
                min={0}
                max={200}
                step="0.001"
                required
                defaultValue="0"
              />
            </label>
          ))}
        </div>
        <label className="field">
          Describe tu proyecto
          <textarea name="message" maxLength={2000} rows={4} />
        </label>
        <label className="flex items-start gap-2">
          <input type="checkbox" required />
          Autorizo a {data} a usar estos datos para atender mi solicitud y
          contactarme.
        </label>
      </ActionForm>
    </main>
  );
}
