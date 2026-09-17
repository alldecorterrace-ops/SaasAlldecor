"use client";
import { useActionState, useState } from "react";
import { createCompany } from "@/app/empresas/actions";
import { Input } from "./ui/input";
import { SubmitButton } from "./submit-button";
import { Feedback } from "./feedback";
export function CompanyForm({ requestId }: { requestId: string }) {
  const [state, action] = useActionState(createCompany, {});
  const [name, setName] = useState("");
  return (
    <form action={action} className="grid gap-4">
      <Feedback error={state.error} />
      <input type="hidden" name="request_id" value={requestId} />
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
