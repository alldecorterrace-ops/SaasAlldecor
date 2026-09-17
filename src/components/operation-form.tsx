"use client";
import { useActionState, type ReactNode } from "react";
import {
  saveOperation,
  type OperationState,
} from "@/app/app/[companyId]/operaciones/actions";
import type { RecordField } from "@/lib/operations";
import { Input } from "./ui/input";
import { Feedback } from "./feedback";
import { SubmitButton } from "./submit-button";
export function OperationForm({
  companyId,
  kind,
  id,
  version,
  initial,
  fields,
  readOnly,
  manager,
  saved,
  children,
}: {
  companyId: string;
  kind: "workers" | "expenses";
  id: string;
  version: number;
  initial: Record<string, unknown>;
  fields: RecordField[];
  readOnly: boolean;
  manager: boolean;
  saved: boolean;
  children?: ReactNode;
}) {
  const [state, action, pending] = useActionState(
    saveOperation.bind(null, companyId, kind),
    {} as OperationState,
  );
  return (
    <form action={action} className="card space-y-5">
      <Feedback
        error={state.error}
        success={saved ? "Registro guardado." : undefined}
      />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="version" value={version} />
      <fieldset
        disabled={readOnly || pending}
        className="grid gap-5 md:grid-cols-2"
      >
        {children}
        {fields.map((f) => {
          const value = String(initial[f.name] ?? ""),
            locked = !!f.managerOnly && !manager;
          return (
            <div
              key={f.name}
              className={f.type === "textarea" ? "md:col-span-2" : ""}
            >
              {locked && <input type="hidden" name={f.name} value={value} />}
              <label className="field">
                {f.label}
                {f.type === "textarea" ? (
                  <textarea
                    name={f.name}
                    rows={4}
                    defaultValue={value}
                    maxLength={f.maxLength}
                    disabled={locked}
                  />
                ) : f.type === "select" ? (
                  <select name={f.name} defaultValue={value} disabled={locked}>
                    {Object.entries(f.options ?? {}).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                ) : f.type === "checkbox" ? (
                  <input
                    name={f.name}
                    type="checkbox"
                    defaultChecked={!!initial[f.name]}
                    className="size-5"
                  />
                ) : (
                  <Input
                    name={f.name}
                    type={f.type === "decimal" ? "text" : (f.type ?? "text")}
                    inputMode={f.type === "decimal" ? "decimal" : undefined}
                    pattern={
                      f.type === "decimal"
                        ? "[0-9]{1,9}([.][0-9]{1,2})?"
                        : undefined
                    }
                    min={f.min}
                    max={f.max}
                    required={f.required}
                    maxLength={f.maxLength}
                    defaultValue={value}
                  />
                )}
              </label>
              {locked && (
                <p className="text-xs text-muted-foreground mt-1">
                  Solo administradores
                </p>
              )}
            </div>
          );
        })}
      </fieldset>
      {!readOnly && (
        <SubmitButton>
          {version ? "Guardar cambios" : "Crear registro"}
        </SubmitButton>
      )}
    </form>
  );
}
