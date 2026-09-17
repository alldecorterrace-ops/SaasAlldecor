"use client";
import { useActionState, type ReactNode } from "react";
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
  const [state, action, pending] = useActionState(
    financeAction.bind(null, companyId),
    {} as FinanceState,
  );
  return (
    <form action={action} className="space-y-4">
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
