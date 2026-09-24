"use client";
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
  const [state, action, , onReset] = usePreservedActionState(
    setExpenseReceipt.bind(null, companyId, id, version),
    {} as OperationState,
  );
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
        <form onReset={onReset} className="mt-5 space-y-4" action={action}>
          <Feedback error={state.error} />
          <label className="field">
            Subir o reemplazar recibo
            <input
              name="receipt"
              type="file"
              accept="image/png,image/jpeg,image/webp,application/pdf"
            />
            <small>
              Hasta 5 MB. Guarda primero los campos del gasto. Los recibos
              anteriores se conservan.
            </small>
          </label>
          <label className="flex gap-2 text-sm">
            <input type="checkbox" name="remove" value="true" />
            Quitar el recibo actual de la ficha
          </label>
          <SubmitButton>Guardar recibo</SubmitButton>
        </form>
      )}
    </section>
  );
}
