"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { usePreservedActionState } from "./use-preserved-action-state";
import { setExpenseReceipt } from "@/app/app/[companyId]/gastos/receipts";
import type { OperationState } from "@/app/app/[companyId]/operaciones/actions";
import { Feedback } from "./feedback";
import { SubmitButton } from "./submit-button";
export function ExpenseReceipt({
  companyId,
  id,
  version,
  url,
  readOnly,
}: {
  companyId: string;
  id: string;
  version: number;
  url: string | null;
  readOnly: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null),
    prepared = useRef<string | null>(null),
    requestId = useRef<string | null>(null);
  const [remove, setRemove] = useState(false),
    [progress, setProgress] = useState("");
  const [state, action, pending, onReset] = usePreservedActionState(
    async (
      previous: OperationState,
      form: FormData,
    ): Promise<OperationState> => {
      try {
        if (!requestId.current) requestId.current = crypto.randomUUID();
        form.set("request_id", requestId.current);
        if (remove) form.set("remove", "true");
        else {
          const file = input.current?.files?.[0];
          if (!file) return { error: "Selecciona un comprobante." };
          if (file.size > 8388608)
            return { error: "El comprobante supera 8 MiB." };
          if (!prepared.current) {
            setProgress("Preparando y verificando el comprobante…");
            const response = await fetch(
              `/api/expenses/${companyId}/${id}/receipt`,
              {
                method: "POST",
                body: file,
                credentials: "same-origin",
                headers: { "x-expense-version": String(version) },
              },
            );
            const data = await response.json();
            if (!response.ok || typeof data.receiptId !== "string")
              return {
                error:
                  typeof data.error === "string"
                    ? data.error
                    : "No se pudo preparar el comprobante.",
              };
            prepared.current = data.receiptId;
          }
          form.set("receipt_id", prepared.current!);
        }
        setProgress("Guardando recibo…");
        const result = await setExpenseReceipt(
          companyId,
          id,
          version,
          previous,
          form,
        );
        if (result.success) router.refresh();
        return result;
      } catch {
        return {
          error:
            "No se pudo confirmar el recibo. Conserva esta página y reintenta; la misma solicitud no se aplica dos veces.",
        };
      } finally {
        setProgress("");
      }
    },
    {} as OperationState,
  );
  const resetRequest = () => {
    prepared.current = null;
    requestId.current = null;
  };
  return (
    <section className="card mt-6">
      <h2 className="font-semibold mb-4">Recibo del gasto</h2>
      {url ? (
        <a
          className="text-primary underline"
          href={url}
          target="_blank"
          rel="noreferrer"
        >
          Abrir recibo privado
        </a>
      ) : (
        <p className="text-sm">Sin recibo adjunto.</p>
      )}
      {!readOnly && (
        <form action={action} onReset={onReset} className="mt-5 space-y-4">
          <Feedback error={state.error} success={state.success} />
          {progress && <p role="status">{progress}</p>}
          <fieldset
            disabled={pending || Boolean(state.success)}
            className="space-y-4"
          >
            <label className="field">
              Subir o reemplazar recibo
              <input
                ref={input}
                type="file"
                accept="image/png,image/jpeg,image/webp,application/pdf"
                disabled={remove}
                onChange={resetRequest}
              />
              <small>
                JPG, PNG, WebP o PDF de hasta 8 MiB. Guarda primero los campos
                del gasto. Los recibos anteriores se conservan.
              </small>
            </label>
            <label className="flex gap-2 text-sm">
              <input
                type="checkbox"
                checked={remove}
                onChange={(e) => {
                  setRemove(e.target.checked);
                  resetRequest();
                }}
              />
              Quitar el recibo actual de la ficha
            </label>
            <SubmitButton>Guardar recibo</SubmitButton>
          </fieldset>
        </form>
      )}
    </section>
  );
}
