"use client";
import { usePreservedActionState } from "./use-preserved-action-state";
import type { ReactNode } from "react";
import {
  timeAction,
  type TimeState,
} from "@/app/app/[companyId]/horas/actions";
import { Feedback } from "./feedback";
import { SubmitButton } from "./submit-button";
export function TimeForm({
  companyId,
  operation,
  label,
  children,
}: {
  companyId: string;
  operation: string;
  label: string;
  children: ReactNode;
}) {
  const [state, action, pending, onReset] = usePreservedActionState(
    timeAction.bind(null, companyId, operation),
    {} as TimeState,
  );
  return (
    <form onReset={onReset} action={action} className="space-y-4">
      <Feedback error={state.error} success={state.success} />
      <fieldset disabled={pending} className="grid gap-4 md:grid-cols-2">
        {children}
      </fieldset>
      <SubmitButton>{label}</SubmitButton>
    </form>
  );
}
