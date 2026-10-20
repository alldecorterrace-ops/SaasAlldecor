"use client";
import { type ReactNode } from "react";
import { usePreservedActionState } from "./use-preserved-action-state";
import {
  submitFieldTime,
  reviewFieldTime,
  type FieldTimeState,
} from "@/app/app/[companyId]/horas/campo/actions";
import { Feedback } from "./feedback";
import { SubmitButton } from "./submit-button";
export function FieldTimeForm({
  company,
  review = false,
  label,
  children,
}: {
  company: string;
  review?: boolean;
  label: string;
  children: ReactNode;
}) {
  const [state, action, pending, onReset] = usePreservedActionState(
    (review ? reviewFieldTime : submitFieldTime).bind(null, company),
    {} as FieldTimeState,
  );
  return (
    <form action={action} onReset={onReset} className="space-y-4">
      <Feedback error={state.error} success={state.success} />
      <fieldset disabled={pending} className="grid gap-4 md:grid-cols-2">
        {children}
      </fieldset>
      <SubmitButton>{label}</SubmitButton>
    </form>
  );
}
