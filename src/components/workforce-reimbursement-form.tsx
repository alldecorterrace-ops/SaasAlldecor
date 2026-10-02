"use client";
import { usePreservedActionState } from "./use-preserved-action-state";
import {
  recordReimbursement,
  type ReimbursementState,
} from "@/app/app/[companyId]/horas/reembolsos/actions";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Feedback } from "./feedback";
export function WorkforceReimbursementForm({
  company,
  worker,
  request,
  items,
  total,
  all,
  disabled = false,
}: {
  company: string;
  worker: string;
  request: string;
  items: Array<{ id: string; version: number }>;
  total: string;
  all: boolean;
  disabled?: boolean;
}) {
  const [state, action, pending, onReset] = usePreservedActionState(
    recordReimbursement.bind(null, company),
    {} as ReimbursementState,
  );
  return (
    <form action={action} onReset={onReset} className="space-y-3 mt-4 min-w-0">
      <Feedback error={state.error} />
      <fieldset disabled={disabled || pending} className="space-y-3 min-w-0">
        <input type="hidden" name="request" value={request} />
        <input type="hidden" name="worker" value={worker} />
        <input type="hidden" name="items" value={JSON.stringify(items)} />
        <input type="hidden" name="total" value={total} />
        <input type="hidden" name="all" value={String(all)} />
        <label className="field">
          Referencia o nota del reembolso
          <Input name="note" required minLength={5} maxLength={500} />
        </label>
        <label className="flex gap-2 items-start text-sm">
          <input className="mt-1" type="checkbox" name="confirmed" required />
          <span>
            Confirmo que este reembolso de {total} USD ya se realizó. Registrar
            esta constancia no transfiere dinero.
          </span>
        </label>
        <Button type="submit" disabled={disabled || pending}>
          {pending
            ? "Procesando…"
            : all
              ? "Registrar constancia de todos"
              : "Registrar constancia de este gasto"}
        </Button>
      </fieldset>
    </form>
  );
}
