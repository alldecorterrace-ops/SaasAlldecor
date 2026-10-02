"use client";
import { useActionState } from "react";
import { sendInvoiceEmail } from "@/app/app/[companyId]/documentos/actions";
import type { InvoiceEmailResult } from "@/lib/invoice-email";
import { Button } from "./ui/button";
export function InvoiceEmailForm({
  companyId,
  invoice,
  version,
  request,
  capture,
  recipient,
}: {
  companyId: string;
  invoice: string;
  version: number;
  request: string;
  capture: boolean;
  recipient: string | null;
}) {
  const [state, action, pending] = useActionState(
    sendInvoiceEmail.bind(null, companyId),
    {} as InvoiceEmailResult,
  );
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="record" value={invoice} />
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
      {!capture && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="confirmed" value="yes" required />
          Confirmo el destinatario y el envío de esta factura.
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
          href={`/api/invoice-email/${companyId}/${state.attemptId}`}
        >
          Descargar mensaje de prueba
        </a>
      )}
    </form>
  );
}
