"use client";
import { useActionState, useRef, type FormEvent } from "react";

type Result = { error?: string; success?: string };

// React resets uncontrolled inputs even when a server action returns an error.
// Keep the draft (including selected files) until a save is confirmed. Redirects
// remount the saved record instead; thrown failures must never clear a draft.
export function usePreservedActionState<State extends Result>(
  action: (previous: State, form: FormData) => Promise<State>,
  initial: Awaited<State>,
) {
  const resetAllowed = useRef(false);
  const [state, submit, pending] = useActionState<State, FormData>(
    async (previous: State, form: FormData) => {
      resetAllowed.current = false;
      const result = await action(previous, form);
      resetAllowed.current = Boolean(result.success) && !result.error;
      return result;
    },
    initial,
  );
  function onReset(event: FormEvent<HTMLFormElement>) {
    if (!resetAllowed.current) event.preventDefault();
  }
  return [state, submit, pending, onReset] as const;
}
