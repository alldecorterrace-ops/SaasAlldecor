"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import {
  saveCustomer,
  type CustomerState,
} from "@/app/app/[companyId]/clientes/actions";
import type { CustomerInput } from "@/lib/validation";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { SubmitButton } from "./submit-button";
import { Feedback } from "./feedback";
export function CustomerForm({
  companyId,
  id,
  version,
  initial,
  readOnly = false,
  saved = false,
}: {
  companyId: string;
  id: string;
  version: number;
  initial: CustomerInput;
  readOnly?: boolean;
  saved?: boolean;
}) {
  const [values, setValues] = useState(initial),
    [state, action] = useActionState(
      saveCustomer.bind(null, companyId),
      {} as CustomerState,
    );
  const fields = [
    ["full_name", "Nombre completo", "text", 255],
    ["email", "Correo electrónico", "email", 254],
    ["phone", "Teléfono", "tel", 64],
    ["address", "Dirección", "text", 255],
    ["city", "Ciudad", "text", 128],
    ["postal_code", "Código postal", "text", 24],
    ["service", "Servicio de interés", "text", 255],
    ["client_date", "Fecha de cliente", "date", 10],
  ] as const;
  return (
    <form action={action} className="card max-w-4xl">
      <Feedback
        error={state.error}
        success={saved ? "Cliente guardado." : undefined}
      />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="version" value={version} />
      <div className="grid gap-5 md:grid-cols-2">
        {fields.map(([key, label, type, max]) => (
          <label key={key} className="field">
            {label}
            {["full_name", "client_date"].includes(key) && " *"}
            <Input
              name={key}
              type={type}
              maxLength={max}
              required={["full_name", "client_date"].includes(key)}
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
            disabled={readOnly}
            value={values.status}
            onChange={(e) =>
              setValues((v) => ({
                ...v,
                status: e.target.value as CustomerInput["status"],
              }))
            }
          >
            <option value="active">Activo</option>
            <option value="archived">Archivado</option>
          </select>
          <small>Archivar conserva los datos y el historial.</small>
        </label>
        <label className="field md:col-span-2">
          Notas
          <textarea
            name="notes"
            rows={5}
            maxLength={10000}
            readOnly={readOnly}
            value={values.notes ?? ""}
            onChange={(e) =>
              setValues((v) => ({ ...v, notes: e.target.value }))
            }
          />
        </label>
      </div>
      <div className="mt-7 flex flex-wrap items-center gap-3 border-t border-border pt-6">
        {!readOnly && (
          <SubmitButton>
            {version === 0 ? "Crear cliente" : "Guardar cambios"}
          </SubmitButton>
        )}
        <Button asChild variant="outline">
          <Link href={`/app/${companyId}/clientes`}>Volver al listado</Link>
        </Button>
        {readOnly && (
          <p className="text-xs text-muted-foreground">
            Tu acceso permite consultar esta ficha.
          </p>
        )}
      </div>
    </form>
  );
}
