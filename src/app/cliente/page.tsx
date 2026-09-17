import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { ActionForm } from "@/components/action-form";
import { respondShare, leaveShare } from "../acceso/actions";
import { PrintButton } from "@/components/print-button";
export const dynamic = "force-dynamic";
export default async function ClientPage() {
  const token = (await cookies()).get("client_access")?.value,
    db = await createClient();
  const { data, error } = token
    ? await db.rpc("read_client_share", { p_token: token })
    : { data: null, error: null };
  if (error || !data)
    return (
      <main className="max-w-lg mx-auto p-6">
        <h1>Acceso no disponible</h1>
        <p>
          Abre el enlace privado que te entregó la empresa. Puede haber vencido
          o sido revocado.
        </p>
      </main>
    );
  const doc = data.document;
  return (
    <main className="max-w-4xl mx-auto p-5 space-y-6">
      <header className="flex justify-between gap-4">
        <h1 className="text-2xl font-semibold">{data.company}</h1>
        <form action={leaveShare} className="print:hidden">
          <button>Cerrar acceso</button>
        </form>
      </header>
      <PrintButton />
      {data.kind === "estimate" ? (
        <>
          <section className="card space-y-3">
            <h2 className="text-xl">
              Propuesta {doc.number} · revisión {doc.version}
            </h2>
            <p>
              {doc.customer} · {doc.date}
            </p>
            {doc.valid_until && <p>Válida hasta {doc.valid_until}</p>}
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr>
                    <th>Descripción</th>
                    <th>Cantidad</th>
                    <th>Importe USD</th>
                  </tr>
                </thead>
                <tbody>
                  {doc.items.map(
                    (
                      i: {
                        name: string;
                        description: string;
                        qty: string;
                        length: string;
                        width: string;
                        unit_price: string;
                        base: string;
                        line_total: string;
                      },
                      n: number,
                    ) => (
                      <tr key={n} className="border-t">
                        <td className="py-3">
                          {i.name}
                          <p className="text-sm">{i.description}</p>
                          {i.base === "area_ft2" && (
                            <small>
                              {i.length} × {i.width} ft
                            </small>
                          )}
                          {i.base === "linear_ft" && (
                            <small>{i.length} ft</small>
                          )}
                        </td>
                        <td>{i.qty}</td>
                        <td>${Number(i.line_total).toFixed(2)}</td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
            <p>
              Subtotal: ${Number(doc.subtotal).toFixed(2)} · Descuento: $
              {Number(doc.discount).toFixed(2)} · Impuestos: $
              {Number(doc.taxes).toFixed(2)}
            </p>
            <p className="text-xl font-semibold">
              Total: ${Number(doc.total).toFixed(2)} USD
            </p>
          </section>
          {data.response ? (
            <p className="card">
              Respuesta registrada:{" "}
              {data.response === "ACCEPTED"
                ? "Aceptación"
                : "Solicitud de cambios"}{" "}
              · {data.respondent}
              <br />
              {data.response_note}
            </p>
          ) : data.can_respond ? (
            <ActionForm action={respondShare} label="Registrar respuesta">
              <p>
                Tu respuesta se refiere a esta revisión. La empresa la revisará
                antes de emitir la factura. No se realiza ningún cargo.
              </p>
              <label className="field">
                Tu nombre
                <input name="name" required minLength={2} maxLength={160} />
              </label>
              <label className="field">
                Respuesta
                <select name="response">
                  <option value="CHANGES">Solicito cambios</option>
                  <option value="ACCEPTED">Acepto esta propuesta</option>
                </select>
              </label>
              <label className="field">
                Comentarios
                <textarea name="note" maxLength={2000} rows={3} />
              </label>
              <label className="flex gap-2">
                <input type="checkbox" required />
                Confirmo que estoy autorizado para responder por el cliente.
              </label>
            </ActionForm>
          ) : (
            <p>
              Esta revisión ya no admite respuestas. Contacta a la empresa para
              confirmar su estado.
            </p>
          )}
        </>
      ) : (
        <>
          <h2 className="text-xl">{data.customer}</h2>
          <section className="card space-y-4">
            <h3 className="font-semibold">Proyectos</h3>
            {data.projects.map(
              (
                p: {
                  name: string;
                  status: string;
                  start_date: string;
                  end_date: string;
                },
                i: number,
              ) => (
                <article key={i}>
                  <strong>{p.name}</strong>
                  <p>
                    {p.status} · Inicio: {p.start_date ?? "Por definir"} · Fin:{" "}
                    {p.end_date ?? "Por definir"}
                  </p>
                </article>
              ),
            )}
            {!data.projects.length && <p>Aún no hay proyectos.</p>}
          </section>
          <section className="card space-y-4">
            <h3 className="font-semibold">Facturas y saldos</h3>
            {data.invoices.map(
              (
                i: {
                  number: string;
                  invoice_date: string;
                  due_date: string;
                  total: number;
                  paid_amount: number;
                  balance_due: number;
                  payment_status: string;
                },
                n: number,
              ) => (
                <article key={n}>
                  <strong>
                    {i.number} · {i.invoice_date}
                  </strong>
                  <p>
                    Total ${Number(i.total).toFixed(2)} · Pagado $
                    {Number(i.paid_amount).toFixed(2)} · Saldo $
                    {Number(i.balance_due).toFixed(2)} USD
                  </p>
                  <p>
                    {i.payment_status}
                    {i.due_date ? ` · Vence ${i.due_date}` : ""}
                  </p>
                </article>
              ),
            )}
            {!data.invoices.length && <p>Aún no hay facturas.</p>}
          </section>
          <p className="text-sm">
            Se muestran los 100 proyectos y facturas más recientes de tu cuenta.
            Para documentación adicional, contacta a la empresa.
          </p>
        </>
      )}
    </main>
  );
}
