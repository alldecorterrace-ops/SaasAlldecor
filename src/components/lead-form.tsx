"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import {
  saveLead,
  convertLead,
  type CommercialState,
} from "@/app/app/[companyId]/leads/actions";
import { leadStatuses, leadLabels, type LeadInput } from "@/lib/commercial";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { SubmitButton } from "./submit-button";
import { Feedback } from "./feedback";
export function LeadForm({
  companyId,
  id,
  version,
  initial,
  readOnly,
  saved,
  customerId,
  canConvert,
}: {
  companyId: string;
  id: string;
  version: number;
  initial: LeadInput;
  readOnly: boolean;
  saved: boolean;
  customerId?: string | null;
  canConvert: boolean;
}) {
  const [values, setValues] = useState(initial),
    [state, action] = useActionState(
      saveLead.bind(null, companyId),
      {} as CommercialState,
    );
  const fields = [
    ["full_name", "Nombre completo", "text", 255],
    ["email", "Correo electrónico", "email", 254],
    ["phone", "Teléfono", "tel", 64],
    ["address", "Dirección", "text", 255],
    ["city", "Ciudad", "text", 128],
    ["postal_code", "Código postal", "text", 24],
    ["service", "Servicio de interés", "text", 255],
    ["lead_date", "Fecha de ingreso", "date", 10],
    ["appointment_date", "Fecha de cita", "date", 10],
    ["contact_preference", "Preferencia de contacto", "text", 60],
    ["source", "Origen", "text", 120],
  ] as const;
  return (
    <div className="space-y-5 max-w-4xl">
      <form action={action} className="card">
        <Feedback
          error={state.error}
          success={saved ? "Lead guardado." : undefined}
        />
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="version" value={version} />
        <div className="grid gap-5 md:grid-cols-2">
          {fields.map(([key, label, type, max]) => (
            <label className="field" key={key}>
              {label}
              {["full_name", "lead_date", "source"].includes(key) && " *"}
              <Input
                name={key}
                type={type}
                maxLength={max}
                required={["full_name", "lead_date", "source"].includes(key)}
                minLength={key === "full_name" ? 2 : undefined}
                readOnly={readOnly}
                value={values[key] ?? ""}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [key]: e.target.value }))
                }
              />
            </label>
          ))}
          <label className="field">
            Estado
            <select
              name="status"
              disabled={readOnly || !!customerId}
              value={values.status}
              onChange={(e) =>
                setValues((v) => ({
                  ...v,
                  status: e.target.value as LeadInput["status"],
                }))
              }
            >
              {leadStatuses
                .filter((s) => s !== "CLIENTE" || !!customerId)
                .map((s) => (
                  <option key={s} value={s}>
                    {leadLabels[s]}
                  </option>
                ))}
            </select>
            {customerId && (
              <input type="hidden" name="status" value="CLIENTE" />
            )}
          </label>
          <label className="field">
            Disponibilidad
            <select
              name="archived"
              disabled={readOnly}
              value={String(values.archived)}
              onChange={(e) =>
                setValues((v) => ({
                  ...v,
                  archived: e.target.value === "true",
                }))
              }
            >
              <option value="false">Activo</option>
              <option value="true">Archivado</option>
            </select>
            <small>
              Archivar conserva los datos y su relación con el cliente.
            </small>
          </label>
          <label className="field md:col-span-2">
            Mensaje y notas
            <textarea
              name="message"
              rows={5}
              maxLength={10000}
              readOnly={readOnly}
              value={values.message}
              onChange={(e) =>
                setValues((v) => ({ ...v, message: e.target.value }))
              }
            />
          </label>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          {!readOnly && (
            <SubmitButton>
              {version ? "Guardar cambios" : "Crear lead"}
            </SubmitButton>
          )}
          <Button asChild variant="outline">
            <Link href={`/app/${companyId}/leads`}>Volver al listado</Link>
          </Button>
        </div>
      </form>
      {version > 0 && (
        <div className="card">
          <h2 className="font-semibold">Relación con el cliente</h2>
          {customerId ? (
            <>
              <p className="my-3 text-sm text-muted-foreground">
                Este lead ya fue convertido. Su historial se conserva.
              </p>
              {canConvert && (
                <Button asChild variant="outline">
                  <Link href={`/app/${companyId}/clientes/${customerId}`}>
                    Abrir cliente
                  </Link>
                </Button>
              )}
            </>
          ) : canConvert && !initial.archived ? (
            <ConvertLeadForm companyId={companyId} id={id} version={version} />
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              Para convertir un lead activo necesitas permiso de escritura en
              Leads y Clientes.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
function ConvertLeadForm({
  companyId,
  id,
  version,
}: {
  companyId: string;
  id: string;
  version: number;
}) {
  const [state, action] = useActionState(
    convertLead.bind(null, companyId, id, version),
    {} as CommercialState,
  );
  return (
    <form action={action} className="mt-3 space-y-4">
      <p className="text-sm text-muted-foreground">
        Se creará un cliente con los datos guardados de este lead y ambos
        quedarán vinculados. Guarda tus cambios antes de convertir.
      </p>
      <Feedback error={state.error} />
      <SubmitButton>Convertir a cliente</SubmitButton>
    </form>
  );
}
