"use client";
import { useActionState, useRef, type ReactNode } from "react";
import {
  financeAction,
  type FinanceState,
} from "@/app/app/[companyId]/facturas/actions";
import { SubmitButton } from "./submit-button";
import { Feedback } from "./feedback";
export function FinanceForm({
  companyId,
  id,
  version,
  operation,
  label,
  children,
  readOnly = false,
}: {
  companyId: string;
  id: string;
  version: number;
  operation: string;
  label: string;
  children: ReactNode;
  readOnly?: boolean;
}) {
  const resetAllowed = useRef(false);
  const [state, action, pending] = useActionState(
    async (previous: FinanceState, form: FormData) => {
      resetAllowed.current = false;
      const result = await financeAction(companyId, previous, form);
      // React resets uncontrolled fields whenever an action resolves, including
      // a returned validation error. Clear them only after a confirmed save.
      resetAllowed.current = Boolean(result.success) && !result.error;
      return result;
    },
    {} as FinanceState,
  );
  return (
    <form
      action={action}
      onReset={(event) => {
        if (!resetAllowed.current) event.preventDefault();
      }}
      className="space-y-4"
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="operation" value={operation} />
      <Feedback error={state.error} success={state.success} />
      <fieldset disabled={pending || readOnly} className="space-y-4">
        {children}
        {!readOnly && <SubmitButton>{label}</SubmitButton>}
      </fieldset>
    </form>
  );
}
