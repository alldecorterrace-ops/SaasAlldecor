"use client";
import { usePreservedActionState } from "./use-preserved-action-state";
import {
  analyzeWorkforceReceipt,
  confirmWorkforceReceipt,
  type WorkforceExpenseState,
} from "@/app/app/[companyId]/horas/gastos/actions";
import { Feedback } from "./feedback";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
export function WorkforceReceiptReviewForm({
  company,
  id,
  version,
  request,
  mode,
  job,
  available = true,
}: {
  company: string;
  id: string;
  version: number;
  request: string;
  mode: "analyze" | "confirm";
  job?: string;
  available?: boolean;
}) {
  const [state, action, pending, onReset] = usePreservedActionState(
    (mode === "analyze"
      ? analyzeWorkforceReceipt
      : confirmWorkforceReceipt
    ).bind(null, company),
    {} as WorkforceExpenseState,
  );
  return (
    <form action={action} onReset={onReset} className="space-y-3 mt-3">
      <Feedback error={state.error} success={state.success} />
      <fieldset disabled={pending || !available} className="min-w-0 space-y-3">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="version" value={version} />
        <input type="hidden" name="request" value={request} />
        {mode === "confirm" && (
          <>
            <input type="hidden" name="job" value={job} />
            <label className="field">
              Nota de revisión humana
              <Input name="note" required minLength={5} maxLength={500} />
            </label>
          </>
        )}
        <Button type="submit" disabled={pending || !available}>
          {pending
            ? "Procesando…"
            : mode === "analyze"
              ? "Analizar recibo con IA"
              : "Confirmar revisión humana"}
        </Button>
      </fieldset>
    </form>
  );
}
