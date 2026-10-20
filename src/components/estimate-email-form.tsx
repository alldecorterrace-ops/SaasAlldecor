"use client";
import { useActionState } from "react";
import { sendEstimateEmail } from "@/app/app/[companyId]/documentos/actions";
import type { EstimateEmailResult } from "@/lib/estimate-email";
import { Button } from "./ui/button";
export function EstimateEmailForm({
  companyId,
  estimate,
  version,
  request,
  capture,
  recipient,
}: {
  companyId: string;
  estimate: string;
  version: number;
  request: string;
  capture: boolean;
  recipient: string | null;
}) {
  const [state, action, pending] = useActionState(
    sendEstimateEmail.bind(null, companyId),
    {} as EstimateEmailResult,
  );
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="record" value={estimate} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="request" value={request} />
      <input type="hidden" name="recipient" value={recipient ?? ""} />
      <p className="text-sm break-all">
        Destinatario: {recipient || "Sin correo en la ficha del cliente"}
      </p>
      <p className="text-sm text-muted-foreground">
        {capture
          ? "Prueba de Enviar por email: guarda el mensaje con el PDF adjunto; no envía correo. Requiere un cliente ficticio de este entorno."
          : "Se enviará al correo actual de la ficha del cliente, con el PDF de esta revisión adjunto."}
      </p>
      <p className="text-sm text-muted-foreground">
        El mensaje y el PDF usan los textos de la revisión guardada. Comprueba
        el contenido y su idioma antes de enviar.
      </p>
      {!capture && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="confirmed" value="yes" required />
          Confirmo el destinatario y el envío de este estimado.
        </label>
      )}
      <Button disabled={pending || !!state.attemptId || !recipient}>
        {pending
          ? "Preparando correo…"
          : capture
            ? "Probar Enviar por email"
            : "Enviar por email"}
      </Button>
      {state.error && (
        <p role="alert" className="text-red-700">
          {state.error}
        </p>
      )}
      {state.success && <p role="status">{state.success}</p>}
      {state.status === "captured" && state.attemptId && (
        <a
          className="block underline"
          href={`/api/estimate-email/${companyId}/${state.attemptId}`}
        >
          Descargar mensaje de prueba
        </a>
      )}
    </form>
  );
}
