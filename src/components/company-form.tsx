"use client";
import { useActionState, useState } from "react";
import { createCompany } from "@/app/empresas/actions";
import { Input } from "./ui/input";
import { SubmitButton } from "./submit-button";
import { Feedback } from "./feedback";
export function CompanyForm({
  requestId,
  subscriptions = [],
}: {
  requestId: string;
  subscriptions?: Array<{
    id: string;
    plan: string;
    companies: number;
    company_limit: number | null;
    writable: boolean;
  }>;
}) {
  const [state, action] = useActionState(createCompany, {});
  const [name, setName] = useState("");
  return (
    <form action={action} className="grid gap-4">
      <Feedback error={state.error} />
      <input type="hidden" name="request_id" value={requestId} />
      {subscriptions.length > 0 && (
        <label className="field">
          Suscripción para esta empresa
          <select
            name="subscription_id"
            required
            defaultValue={
              subscriptions.find(
                (s) =>
                  s.writable &&
                  (s.company_limit === null || s.companies < s.company_limit),
              )?.id
            }
          >
            {subscriptions.map((s) => (
              <option
                key={s.id}
                value={s.id}
                disabled={
                  !s.writable ||
                  (s.company_limit !== null && s.companies >= s.company_limit)
                }
              >
                {s.plan} · {s.companies} empresas
                {s.company_limit === null
                  ? " · sin límite"
                  : ` de ${s.company_limit}`}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="field">
        Nombre de la empresa
        <Input
          name="name"
          required
          minLength={2}
          maxLength={160}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej. All Decor Terrace"
        />
      </label>
      <SubmitButton>Crear empresa</SubmitButton>
    </form>
  );
}
