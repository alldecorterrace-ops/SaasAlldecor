import { randomUUID } from "node:crypto";
import { inventoryAccess } from "@/lib/inventory-server";
import {
  businessDate,
  quantity,
  usd,
  costUsd,
  invError,
  type InventoryContext,
} from "@/lib/inventory";
import { InventoryForm } from "./form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Threshold = {
  location_id: string;
  location_name: string;
  quantity: number;
  minimum: number;
  unit: string;
};
export async function MinimumEditor({
  company,
  target,
  slug,
  ctx,
}: {
  company: string;
  target: string;
  slug: "productos" | "existencias";
  ctx: InventoryContext;
}) {
  const { db } = await inventoryAccess(company);
  const { data, error } = await db
    .rpc("inventory_minimum_rows", {
      p_company: company,
      p_low: false,
      p_target: target,
    })
    .eq("target_kind", slug === "productos" ? "FAMILY" : "VARIANT");
  if (error) throw new Error("No se pudieron consultar los mínimos.");
  const rows = (data ?? []) as Threshold[];
  return (
    <details className="card">
      <summary className="cursor-pointer font-semibold">
        Mínimos por ubicación
      </summary>
      {rows.length ? (
        <ul className="my-3">
          {rows.map((r) => (
            <li key={r.location_id}>
              {r.location_name} · Mínimo {quantity(r.minimum)}{" "}
              {r.unit.toLowerCase()} · Hay {quantity(r.quantity)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="my-3 text-sm">Sin mínimos configurados.</p>
      )}
      {ctx.catalogManage && ctx.locations.some((l) => l.active) && (
        <InventoryForm
          company={company}
          id={target}
          request={randomUUID()}
          operation="minimum"
          slug={slug}
          submit="Guardar mínimo"
        >
          <label className="field">
            Ubicación
            <select name="location" required>
              {ctx.locations
                .filter((l) => l.active)
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="field">
            Mínimo deseado (0 desactiva el aviso)
            <Input name="minimum" type="number" step=".001" min="0" required />
          </label>
        </InventoryForm>
      )}
    </details>
  );
}
type ChargePreview = {
  stamp: string;
  lines: {
    variant_id: string;
    name: string;
    qty: number;
    base_value: number;
    share: number;
    unit_increment: number;
    current_cost: number;
  }[];
};
export async function PurchaseCharges({
  company,
  documentId,
  amount,
  canWrite,
}: {
  company: string;
  documentId: string;
  amount: string;
  canWrite: boolean;
}) {
  const { db } = await inventoryAccess(company);
  const [charges, preview] = await Promise.all([
    db.rpc("inventory_purchase_charges", {
      p_company: company,
      p_document: documentId,
    }),
    amount && canWrite && /^\d{1,12}(\.\d{1,2})?$/.test(amount)
      ? db.rpc("inventory_charge_preview", {
          p_company: company,
          p_document: documentId,
          p_amount: amount,
        })
      : { data: null, error: null },
  ]);
  if (charges.error)
    throw new Error("No se pudieron consultar los gastos de la compra.");
  const planned = preview.data as ChargePreview | null;
  return (
    <section className="card grid gap-4">
      <h2>Flete, aduana y otros gastos de compra</h2>
      {(
        charges.data as {
          id: string;
          kind: string;
          amount: number;
          note: string;
          created_at: string;
        }[]
      ).map((c) => (
        <p key={c.id}>
          {businessDate(c.created_at.slice(0, 10))} · {c.kind} · {usd(c.amount)}{" "}
          · {c.note}
        </p>
      ))}
      {canWrite && (
        <>
          <p className="text-sm">
            Cada variante recibe una parte proporcional al valor original de su
            mercancía. El gasto actualiza el costo de lo que queda y de las
            salidas futuras.
          </p>
          <form className="flex flex-wrap items-end gap-3">
            <label className="field">
              Importe a distribuir (USD)
              <Input
                type="number"
                min=".01"
                max="999999999999.99"
                step=".01"
                name="gasto"
                defaultValue={amount}
                required
              />
            </label>
            <Button variant="outline">Calcular distribución</Button>
          </form>
          {preview.error && <p role="alert">{invError(preview.error)}</p>}
          {planned && (
            <>
              <div className="overflow-x-auto">
                <table>
                  <thead>
                    <tr>
                      <th>Variante</th>
                      <th>Mercancía</th>
                      <th>Parte del gasto</th>
                      <th>Nuevo costo unitario</th>
                    </tr>
                  </thead>
                  <tbody>
                    {planned.lines.map((l) => (
                      <tr key={l.variant_id}>
                        <td>{l.name}</td>
                        <td>{usd(l.base_value)}</td>
                        <td>{usd(l.share)}</td>
                        <td>
                          {costUsd(
                            Number(l.current_cost) + Number(l.unit_increment),
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <InventoryForm
                company={company}
                slug="compras"
                operation="charge"
                id={documentId}
                request={randomUUID()}
                submit="Confirmar gasto y distribución"
              >
                <input type="hidden" name="amount" value={amount} />
                <input type="hidden" name="stamp" value={planned.stamp} />
                <label className="field">
                  Concepto
                  <select name="kind">
                    <option value="FLETE">Flete</option>
                    <option value="ADUANA">Aduana</option>
                    <option value="OTRO">Otro</option>
                  </select>
                </label>
                <label className="field">
                  Referencia o motivo
                  <Input name="note" maxLength={2000} required />
                </label>
              </InventoryForm>
            </>
          )}
        </>
      )}
    </section>
  );
}
