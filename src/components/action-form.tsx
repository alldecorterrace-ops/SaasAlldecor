"use client";
import { useActionState, useRef, type ReactNode } from "react";
import { Feedback } from "./feedback";
import { SubmitButton } from "./submit-button";
export type ActionState = { error?: string; success?: string; link?: string };
export function ActionForm({
  action,
  children,
  label = "Guardar",
  disabled = false,
}: {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  children: ReactNode;
  label?: string;
  disabled?: boolean;
}) {
  const resetAllowed = useRef(false);
  const [state, submit, pending] = useActionState(
    async (previous: ActionState, form: FormData) => {
      resetAllowed.current = false;
      const result = await action(previous, form);
      // A resolved validation error also triggers React's automatic form reset.
      // Preserve the user's input unless the action confirms a successful save.
      resetAllowed.current = Boolean(result.success) && !result.error;
      return result;
    },
    {} as ActionState,
  );
  return (
    <form
      action={submit}
      onReset={(event) => {
        if (!resetAllowed.current) event.preventDefault();
      }}
      className="card space-y-4"
    >
      <Feedback error={state.error} success={state.success} />
      {state.link && (
        <div className="rounded bg-muted p-3 break-all">
          <p>
            Guarda este enlace privado. Quien lo tenga podrá acceder hasta su
            vencimiento o revocación.
          </p>
          <a className="underline" href={state.link}>
            {state.link}
          </a>
        </div>
      )}
      <fieldset disabled={disabled || pending} className="space-y-4">
        {children}
        {!disabled && <SubmitButton>{label}</SubmitButton>}
      </fieldset>
    </form>
  );
}
