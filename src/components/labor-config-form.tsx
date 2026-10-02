"use client";
import type { ReactNode } from "react";
import {
  saveLabor,
  type LaborState,
} from "@/app/app/[companyId]/horas/labor/actions";
import { usePreservedActionState } from "./use-preserved-action-state";
import { Feedback } from "./feedback";
import { Button } from "./ui/button";
export function LaborConfigForm({
  company,
  kind,
  id,
  version,
  request,
  children,
  disabled = false,
}: {
  company: string;
  kind: "RATE" | "PROJECT" | "SETTINGS";
  id: string;
  version: number;
  request: string;
  children: ReactNode;
  disabled?: boolean;
}) {
  const [state, action, pending, onReset] = usePreservedActionState(
    saveLabor.bind(null, company, kind, id, version),
    {} as LaborState,
  );
  return (
    <form action={action} onReset={onReset} className="space-y-3 min-w-0">
      <Feedback error={state.error} />
      <fieldset disabled={disabled || pending} className="space-y-3 min-w-0">
        <input type="hidden" name="request" value={request} />
        {children}
        <label className="field">
          Motivo del cambio
          <textarea
            name="reason"
            required
            minLength={5}
            maxLength={1000}
            rows={2}
          />
        </label>
        <Button type="submit" disabled={disabled || pending}>
          {pending ? "Procesando…" : "Guardar configuración"}
        </Button>
      </fieldset>
    </form>
  );
}
