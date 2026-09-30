"use client";
import { useState, useRef } from "react";
import { usePreservedActionState } from "./use-preserved-action-state";
import {
  submitWorkforceExpense,
  decideWorkforceExpense,
  type WorkforceExpenseState,
} from "@/app/app/[companyId]/horas/gastos/actions";
import { workforceExpenseCategories, workforceUtcDateTime } from "@/lib/workforce-expenses";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Feedback } from "./feedback";
import { SubmitButton } from "./submit-button";
export function WorkforceExpenseForm({
  company,
  id,
  request,
  projects,
  now,
}: {
  company: string;
  id: string;
  request: string;
  projects: { id: string; name: string }[];
  now: string;
}) {
  const receipt = useRef<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [state, action, pending, onReset] = usePreservedActionState(
    async (prev: WorkforceExpenseState, form: FormData) => {
      const at = workforceUtcDateTime(String(form.get("expense_at") ?? ""));
      if (!at) return { error: "Indica una fecha y hora válidas en UTC." };
      if (!file) return { error: "Adjunta el recibo antes de enviar." };
      if (!receipt.current) {
        try {
          const response = await fetch(
            `/api/workforce/${company}/expenses/${id}/receipt`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/octet-stream",
                "X-Receipt-Name": encodeURIComponent(file.name),
              },
              body: file,
            },
          );
          const result = await response.json();
          if (!response.ok || !result.receiptId)
            return {
              error:
                result.error ??
                "No se pudo guardar el recibo. Conserva el archivo y reintenta.",
            };
          receipt.current = result.receiptId;
        } catch {
          return {
            error:
              "Se perdió la conexión. Conserva el recibo y reintenta este formulario.",
          };
        }
      }
      form.set("receipt_id", receipt.current!);
      form.set("expense_at", at);
      return submitWorkforceExpense(company, prev, form);
    },
    {} as WorkforceExpenseState,
  );
  return (
    <form onReset={onReset} action={action} className="card space-y-4">
      <h2 className="font-semibold text-xl">Enviar mi gasto</h2>
      <p className="text-sm">
        Adjunta un recibo de hasta 8 MiB. El gasto pasará primero por tu
        encargado y después por oficina.
      </p>
      <Feedback error={state.error} />
      <fieldset disabled={pending} className="grid gap-4 md:grid-cols-2">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="request" value={request} />
        <label className="field">
          Obra
          <select name="project_id" required defaultValue="">
            <option value="" disabled>
              Selecciona una obra
            </option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Importe
          <Input
            type="number"
            name="amount"
            min="0.01"
            max="10000"
            step="0.01"
            required
          />
        </label>
        <label className="field">
          Categoría
          <select name="category">
            {Object.entries(workforceExpenseCategories).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Fecha y hora (UTC)
          <Input
            name="expense_at"
            type="datetime-local"
            step="1"
            defaultValue={now.slice(0, 19)}
            required
          />
        </label>
        <label className="field md:col-span-2">
          Descripción
          <Input name="description" maxLength={1000} />
        </label>
        <label className="field md:col-span-2">
          Recibo
          <input
            aria-label="Recibo"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
            required
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              receipt.current = null;
            }}
          />
        </label>
      </fieldset>
      <SubmitButton>Enviar al encargado</SubmitButton>
      {!projects.length && (
        <p className="text-sm">
          No tienes obras disponibles. Solicita revisar tu asignación.
        </p>
      )}
    </form>
  );
}
export function WorkforceDecisionForm({
  company,
  id,
  version,
  request,
  stage,
}: {
  company: string;
  id: string;
  version: number;
  request: string;
  stage: "encargado" | "oficina";
}) {
  const [state, action, pending, onReset] = usePreservedActionState(
    decideWorkforceExpense.bind(null, company),
    {} as WorkforceExpenseState,
  );
  return (
    <form onReset={onReset} action={action} className="space-y-3 mt-4">
      <Feedback error={state.error} success={state.success} />
      <fieldset disabled={pending} className="grid gap-3 sm:grid-cols-2">
        <input name="id" type="hidden" value={id} />
        <input name="version" type="hidden" value={version} />
        <input name="request" type="hidden" value={request} />
        <label className="field">
          Decisión de {stage}
          <select name="decision">
            <option value="APPROVE">Aprobar</option>
            <option value="REJECT">Rechazar</option>
          </select>
        </label>
        <label className="field">
          Motivo (obligatorio al rechazar)
          <Input name="reason" maxLength={1000} />
        </label>
      </fieldset>
      <Button type="submit" disabled={pending}>
        {pending ? "Procesando…" : `Registrar decisión de ${stage}`}
      </Button>
    </form>
  );
}
