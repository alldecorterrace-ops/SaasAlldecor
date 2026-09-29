"use client";
import { useState } from "react";
import Link from "next/link";
import {
  saveExpenseBatch,
  type ExpenseBatchState,
} from "@/app/app/[companyId]/gastos/lote/actions";
import { expenseCategories } from "@/lib/expense-batch";
import { expenseMethods, expensePayers } from "@/lib/operations";
import { usePreservedActionState } from "./use-preserved-action-state";
import { EntitySelect } from "./entity-select";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Feedback } from "./feedback";
type Draft = {
  id: string;
  date: string;
  amount: string;
  category: string;
  description: string;
  vendor: string;
  document: string;
  method: string;
  payer: string;
  project: { id: string; name: string } | null;
  worker: { id: string; name: string } | null;
};
export function ExpenseBatchForm({
  companyId,
  batchId,
  firstId,
  date,
  projects,
  workers,
}: {
  companyId: string;
  batchId: string;
  firstId: string;
  date: string;
  projects: boolean;
  workers: boolean;
}) {
  const empty = (id: string): Draft => ({
    id,
    date,
    amount: "",
    category: "Materiales",
    description: "",
    vendor: "",
    document: "",
    method: "TARJETA_EXTERNA",
    payer: "EMPRESA",
    project: null,
    worker: null,
  });
  const [rows, setRows] = useState<Draft[]>([empty(firstId)]);
  const [state, action, pending, onReset] = usePreservedActionState(
    saveExpenseBatch.bind(null, companyId, batchId),
    {} as ExpenseBatchState,
  );
  const update = <K extends keyof Draft>(id: string, key: K, value: Draft[K]) =>
    setRows((old) =>
      old.map((r) => (r.id === id ? { ...r, [key]: value } : r)),
    );
  if (state.ids)
    return (
      <section className="card space-y-4">
        <p role="status">{state.success}</p>
        <p>
          Los gastos quedaron aprobados por administración. Esto no efectúa
          pagos ni reembolsos.
        </p>
        <ol className="space-y-2">
          {state.ids.map((id, i) => (
            <li key={id}>
              <Link
                className="underline"
                href={`/app/${companyId}/gastos/${id}`}
              >
                Gasto {i + 1} · Ver ficha y adjuntar comprobante
              </Link>
            </li>
          ))}
        </ol>
        <Button asChild>
          <Link href={`/app/${companyId}/gastos`}>Volver al registro</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/app/${companyId}/gastos/lote`}>
            Registrar otro lote
          </Link>
        </Button>
      </section>
    );
  return (
    <form action={action} onReset={onReset} className="space-y-5">
      <Feedback error={state.error} />
      <input
        type="hidden"
        name="rows"
        value={JSON.stringify(rows.map((r) => r.id))}
      />
      <p>
        Si una fila tiene un error, no se guarda ninguna. El cliente se obtiene
        del proyecto. El pagador trabajador requiere una ficha de trabajador; su
        reembolso queda pendiente.
      </p>
      <p className="text-sm text-muted-foreground">
        Los comprobantes se adjuntan desde cada ficha después de registrar el
        lote. Al duplicar una fila, el número de documento queda vacío para
        evitar registrar el mismo comprobante dos veces.
      </p>
      <fieldset disabled={pending} className="space-y-5">
        {rows.map((row, index) => (
          <section
            key={row.id}
            className="card space-y-4"
            aria-label={`Fila ${index + 1}`}
          >
            <div className="flex flex-wrap justify-between gap-2">
              <h2 className="font-semibold">Gasto {index + 1}</h2>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={rows.length >= 100}
                  onClick={() =>
                    setRows((old) => [
                      ...old,
                      { ...row, id: crypto.randomUUID(), document: "" },
                    ])
                  }
                >
                  Duplicar fila {index + 1}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={rows.length === 1}
                  onClick={() =>
                    setRows((old) => old.filter((r) => r.id !== row.id))
                  }
                >
                  Quitar fila {index + 1}
                </Button>
              </div>
            </div>
            <div className="grid min-w-0 gap-4 md:grid-cols-2 lg:grid-cols-3">
              <label className="field">
                Fecha
                <Input
                  required
                  type="date"
                  name={`${row.id}.expense_date`}
                  value={row.date}
                  onChange={(e) => update(row.id, "date", e.target.value)}
                />
              </label>
              <label className="field">
                Importe (USD)
                <Input
                  required
                  inputMode="decimal"
                  pattern="[0-9]{1,8}([.][0-9]{1,2})?"
                  name={`${row.id}.amount`}
                  value={row.amount}
                  onChange={(e) => update(row.id, "amount", e.target.value)}
                />
              </label>
              <label className="field">
                Categoría
                <select
                  name={`${row.id}.category`}
                  value={row.category}
                  onChange={(e) => update(row.id, "category", e.target.value)}
                >
                  {expenseCategories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <EntitySelect
                companyId={companyId}
                kind="projects"
                name={`${row.id}.project_id`}
                label="Proyecto"
                initial={row.project}
                onValueChange={(choice) => update(row.id, "project", choice)}
                canSearch={projects}
                emptyLabel="General de la empresa"
              />
              <label className="field">
                Pagado por
                <select
                  name={`${row.id}.payer`}
                  value={row.payer}
                  onChange={(e) => {
                    const payer = e.target.value;
                    setRows((old) =>
                      old.map((r) =>
                        r.id === row.id ? { ...r, payer, worker: null } : r,
                      ),
                    );
                  }}
                >
                  {Object.entries(expensePayers).map(([v, label]) => (
                    <option key={v} value={v}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              {row.payer === "TRABAJADOR" ? (
                <EntitySelect
                  companyId={companyId}
                  kind="workers"
                  name={`${row.id}.worker_id`}
                  label="Trabajador"
                  initial={row.worker}
                  onValueChange={(choice) => update(row.id, "worker", choice)}
                  canSearch={workers}
                />
              ) : (
                <input type="hidden" name={`${row.id}.worker_id`} value="" />
              )}
              <label className="field">
                Método
                <select
                  name={`${row.id}.method`}
                  value={row.method}
                  onChange={(e) => update(row.id, "method", e.target.value)}
                >
                  {Object.entries(expenseMethods).map(([v, label]) => (
                    <option key={v} value={v}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Proveedor
                <Input
                  name={`${row.id}.vendor`}
                  maxLength={190}
                  value={row.vendor}
                  onChange={(e) => update(row.id, "vendor", e.target.value)}
                />
              </label>
              <label className="field">
                Número de documento
                <Input
                  name={`${row.id}.document_number`}
                  maxLength={100}
                  value={row.document}
                  onChange={(e) => update(row.id, "document", e.target.value)}
                />
              </label>
              <label className="field md:col-span-2 lg:col-span-3">
                Descripción
                <textarea
                  name={`${row.id}.description`}
                  maxLength={500}
                  value={row.description}
                  onChange={(e) =>
                    update(row.id, "description", e.target.value)
                  }
                />
              </label>
            </div>
          </section>
        ))}
      </fieldset>
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={pending || rows.length >= 100}
          onClick={() => setRows((old) => [...old, empty(crypto.randomUUID())])}
        >
          Añadir fila
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Procesando…" : `Registrar ${rows.length} gasto(s)`}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Hasta 100 gastos por lote. Si no recibes confirmación, reintenta desde
        esta página con los mismos datos o vuelve a abrirla para consultar el
        resultado.
      </p>
    </form>
  );
}
