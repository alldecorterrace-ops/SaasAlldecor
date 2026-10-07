"use client";
import { usePreservedActionState } from "./use-preserved-action-state";
import {
  saveIdentity,
  type IdentityActionState,
} from "@/app/app/[companyId]/documentos/empresa/actions";
import {
  commercialIdentityFields,
  type CommercialIdentity,
} from "@/lib/commercial-identity";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
export function CommercialIdentityForm({
  companyId,
  identity,
  version,
}: {
  companyId: string;
  identity: CommercialIdentity;
  version: number;
}) {
  const [state, action, pending, onReset] = usePreservedActionState(
    saveIdentity.bind(null, companyId),
    {} as IdentityActionState,
  );
  return (
    <form
      action={action}
      onReset={onReset}
      className="card space-y-5 max-w-3xl"
    >
      <input type="hidden" name="version" value={state.version ?? version} />
      {commercialIdentityFields.map(([key, label, max]) => (
        <div key={key}>
          <label
            htmlFor={`identity-${key}`}
            className="block text-sm font-medium mb-2"
          >
            {label}
          </label>
          {["address", "payment_instructions", "footer"].includes(key) ? (
            <textarea
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
              id={`identity-${key}`}
              name={key}
              defaultValue={identity[key]}
              maxLength={max}
              rows={3}
            />
          ) : (
            <Input
              id={`identity-${key}`}
              name={key}
              defaultValue={identity[key]}
              maxLength={max}
              type={
                key === "email" ? "email" : key === "website" ? "url" : "text"
              }
            />
          )}
        </div>
      ))}
      <label className="flex gap-2 items-start text-sm">
        <input type="checkbox" name="confirmed" value="yes" required />
        Confirmo que los datos y las acreditaciones indicados pertenecen a esta
        empresa y deben aparecer en sus documentos comerciales.
      </label>
      <Button disabled={pending}>
        {pending ? "Guardando…" : "Guardar datos comerciales"}
      </Button>
      {state.error && (
        <p role="alert" className="text-red-700">
          {state.error}
        </p>
      )}
      {state.success && <p role="status">{state.success}</p>}
    </form>
  );
}
