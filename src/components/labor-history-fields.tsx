"use client";
import { useState } from "react";
import type { LaborHistorySource } from "@/lib/labor-history";
import { laborAmountCents } from "@/lib/labor-history";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
export function LaborHistoryFields({
  source,
  workers,
}: {
  source: LaborHistorySource;
  workers: [string, string][];
}) {
  const [rows, setRows] = useState(
    () =>
      source.link?.allocations.map((a, n) => ({
        key: n,
        worker: source.worker ?? a.worker,
        date: a.date,
        amount: (a.cents / 100).toFixed(2),
      })) ?? [{ key: 0, worker: source.worker ?? "", date: "", amount: "" }],
  );
  const [active, setActive] = useState(source.link?.active ?? true);
  const total = rows.reduce(
    (sum, r) => sum + (laborAmountCents(r.amount) ?? 0),
    0,
  );
  const usd = (value: number) =>
    new Intl.NumberFormat("es-US", {
      style: "currency",
      currency: "USD",
    }).format(value / 100);
  const change = (
    key: number,
    field: "worker" | "date" | "amount",
    value: string,
  ) => setRows(rows.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  return (
    <>
      <input type="hidden" name="expense_version" value={source.version} />
      <p>
        Relaciona únicamente las jornadas acreditadas por el comprobante. Su
        fecha de registro no confirma el día trabajado.
      </p>
      <p role="status">
        Importe original {usd(source.amountCents)} · Distribuido {usd(total)} ·
        Diferencia {usd(source.amountCents - total)}
      </p>
      {rows.map((row, n) => (
        <fieldset
          className="border rounded-lg p-3 space-y-3 min-w-0"
          key={row.key}
        >
          <legend>Jornada {n + 1}</legend>
          <label className="field">
            Trabajador de la jornada
            <select
              name="allocation_worker"
              required
              value={row.worker}
              disabled={source.worker !== null}
              onChange={(e) => change(row.key, "worker", e.target.value)}
            >
              <option value="">Selecciona</option>
              {workers
                .filter(
                  ([id]) => source.worker === null || id === source.worker,
                )
                .map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
            </select>
          </label>
          {source.worker !== null && (
            <input
              type="hidden"
              name="allocation_worker"
              value={source.worker}
            />
          )}
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="field">
              Fecha trabajada
              <Input
                type="date"
                name="allocation_date"
                required
                value={row.date}
                onChange={(e) => change(row.key, "date", e.target.value)}
              />
            </label>
            <label className="field">
              Costo ya registrado (USD)
              <Input
                type="number"
                min="0.01"
                step="0.01"
                name="allocation_amount"
                required
                value={row.amount}
                onChange={(e) => change(row.key, "amount", e.target.value)}
              />
            </label>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={rows.length === 1}
            onClick={() => setRows(rows.filter((r) => r.key !== row.key))}
          >
            Retirar jornada {n + 1}
          </Button>
        </fieldset>
      ))}
      <Button
        type="button"
        variant="outline"
        disabled={rows.length >= 100}
        onClick={() =>
          setRows([
            ...rows,
            {
              key: Math.max(...rows.map((r) => r.key)) + 1,
              worker: source.worker ?? "",
              date: "",
              amount: "",
            },
          ])
        }
      >
        Añadir jornada
      </Button>
      <label className="flex gap-2">
        <input
          type="checkbox"
          name="active"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
        />
        Correspondencia activa
      </label>
      <p className="text-sm">
        Desactivarla conserva el historial y deja el costo anterior pendiente de
        conciliación.
      </p>
    </>
  );
}
