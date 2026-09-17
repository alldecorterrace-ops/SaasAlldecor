"use client";
import {
  useActionState,
  useSyncExternalStore,
  useState,
  type ReactNode,
} from "react";
import {
  saveWork,
  inventoryMovement,
  workAttachment,
  type WorkState,
} from "@/app/app/[companyId]/operaciones/work-actions";
import type { RecordField } from "@/lib/operations";
import { Input } from "./ui/input";
import { Feedback } from "./feedback";
import { SubmitButton } from "./submit-button";
const subscribe = () => () => {};
function localValue(value: string) {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function LocalDateTime({
  field,
  value,
}: {
  field: RecordField;
  value: string;
}) {
  const browser = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const [edited, setLocal] = useState<string | null>(null);
  const local = edited ?? (browser ? localValue(value) : "");
  const date = new Date(local);
  // Preserve server-clock seconds until the person actually changes the field.
  // Reject nonexistent local times rather than silently shifting a DST gap.
  const iso =
    edited === null
      ? value
      : local &&
          Number.isFinite(date.getTime()) &&
          localValue(date.toISOString()) === local
        ? date.toISOString()
        : "";
  return (
    <>
      <Input
        type="datetime-local"
        required={field.required}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
      />
      <input type="hidden" name={field.name} value={iso} />
      <span className="text-xs text-muted-foreground">
        Hora local de este dispositivo; se guarda con zona horaria.
      </span>
    </>
  );
}
export function WorkForm({
  companyId,
  kind,
  id,
  version,
  name,
  status,
  statuses,
  data,
  fields,
  readOnly,
  saved,
  children,
}: {
  companyId: string;
  kind: string;
  id: string;
  version: number;
  name: string;
  status: string;
  statuses: Record<string, string>;
  data: Record<string, string>;
  fields: RecordField[];
  readOnly: boolean;
  saved: boolean;
  children?: ReactNode;
}) {
  const [state, action, pending] = useActionState(
    saveWork.bind(null, companyId, kind),
    {} as WorkState,
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
        <label className="field">
          Nombre / tipo
          <Input
            name="name"
            defaultValue={name}
            required
            minLength={2}
            maxLength={190}
          />
        </label>
        <label className="field">
          Estado
          <select name="status" defaultValue={status}>
            {Object.entries(statuses).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        {children}
        {fields.map((f) => (
          <label
            key={f.name}
            className={`field ${f.type === "textarea" ? "md:col-span-2" : ""}`}
          >
            {f.label}
            {f.type === "textarea" ? (
              <textarea
                name={f.name}
                rows={f.name === "steps" ? 10 : 4}
                defaultValue={data[f.name] ?? ""}
                maxLength={f.maxLength}
              />
            ) : f.type === "datetime-local" ? (
              <LocalDateTime field={f} value={data[f.name] ?? ""} />
            ) : (
              <Input
                name={f.name}
                type={f.type === "decimal" ? "text" : (f.type ?? "text")}
                inputMode={f.type === "decimal" ? "decimal" : undefined}
                defaultValue={data[f.name] ?? ""}
                required={f.required}
                min={f.min}
                max={f.max}
                maxLength={f.maxLength}
              />
            )}
          </label>
        ))}
      </fieldset>
      {!readOnly && (
        <SubmitButton>
          {version ? "Guardar cambios" : "Crear registro"}
        </SubmitButton>
      )}
    </form>
  );
}
export function WorkActionForm({
  companyId,
  kind,
  operation,
  children,
  label,
}: {
  companyId: string;
  kind: string;
  operation: "movement" | "attachment";
  children: ReactNode;
  label: string;
}) {
  const actionFn =
    operation === "movement"
      ? inventoryMovement.bind(null, companyId)
      : workAttachment.bind(null, companyId, kind);
  const [state, action, pending] = useActionState(actionFn, {} as WorkState);
  return (
    <form action={action} className="space-y-3">
      <Feedback error={state.error} success={state.success} />
      <fieldset disabled={pending} className="space-y-3">
        {children}
        <SubmitButton>{label}</SubmitButton>
      </fieldset>
    </form>
  );
}
