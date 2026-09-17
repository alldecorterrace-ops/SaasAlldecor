"use client";
import { useActionState, useState } from "react";
import {
  updateCompany,
  addMember,
  updateMember,
  type SettingsState,
} from "@/app/app/[companyId]/configuracion/actions";
import { type Membership, modules } from "@/lib/modules";
import { Input } from "./ui/input";
import { SubmitButton } from "./submit-button";
import { Feedback } from "./feedback";
export function CompanySettings({
  company,
  writable,
}: {
  company: { id: string; name: string; timezone: string };
  writable: boolean;
}) {
  const [state, action] = useActionState(
    updateCompany.bind(null, company.id),
    {} as SettingsState,
  );
  const [name, setName] = useState(company.name),
    [timezone, setTimezone] = useState(company.timezone);
  return (
    <form action={action} className="card grid gap-5">
      <h2 className="font-semibold">Datos de la empresa</h2>
      <Feedback {...state} />
      <label className="field">
        Nombre
        <Input
          name="name"
          required
          minLength={2}
          maxLength={160}
          readOnly={!writable}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="field">
        Zona horaria
        <Input
          name="timezone"
          required
          readOnly={!writable}
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          list="timezones"
        />
        <datalist id="timezones">
          <option value="America/New_York" />
          <option value="America/Chicago" />
          <option value="America/Denver" />
          <option value="America/Los_Angeles" />
          <option value="America/Puerto_Rico" />
          <option value="UTC" />
        </datalist>
        <small>Se utiliza para presentar fechas y horas de esta empresa.</small>
      </label>
      {writable && (
        <div>
          <SubmitButton>Guardar configuración</SubmitButton>
        </div>
      )}
    </form>
  );
}
export function AddMember({ companyId }: { companyId: string }) {
  const [state, action] = useActionState(
    addMember.bind(null, companyId),
    {} as SettingsState,
  );
  const [email, setEmail] = useState("");
  return (
    <form action={action} className="card grid gap-4">
      <h2 className="font-semibold">Incorporar al equipo</h2>
      <p className="text-sm leading-6 text-muted-foreground">
        La persona debe tener una cuenta registrada y su correo confirmado. Se
        agrega con acceso de consulta a clientes; puedes ajustar sus permisos
        después.
      </p>
      <Feedback {...state} />
      <label className="field">
        Correo de su cuenta
        <Input
          name="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <div>
        <SubmitButton>Agregar miembro</SubmitButton>
      </div>
      <p className="text-xs text-muted-foreground">
        Esta acción no envía correos ni invitaciones.
      </p>
    </form>
  );
}
export function MemberPermissions({
  companyId,
  target,
  actor,
}: {
  companyId: string;
  target: Membership;
  actor: Membership;
}) {
  const [state, action] = useActionState(
    updateMember.bind(null, companyId, target.user_id),
    {} as SettingsState,
  );
  const [role, setRole] = useState(target.role),
    [active, setActive] = useState(target.active),
    [permissions, setPermissions] = useState(target.permissions);
  const locked =
    target.role === "owner" ||
    target.user_id === actor.user_id ||
    (actor.role === "admin" && target.role === "admin");
  function change(id: string, action: string, checked: boolean) {
    setPermissions((old) => ({
      ...old,
      [id]: checked
        ? [...new Set([...(old[id] ?? []), action])]
        : (old[id] ?? []).filter((v) => v !== action),
    }));
  }
  return (
    <details className="card">
      <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3">
        <span className="text-sm font-semibold break-all">{target.email}</span>
        <span className="text-xs text-muted-foreground">
          {target.role === "owner"
            ? "Propietario"
            : target.role === "admin"
              ? "Administrador"
              : "Miembro"}{" "}
          · {target.active ? "Activo" : "Suspendido"}
        </span>
      </summary>
      {locked ? (
        <p className="mt-5 text-sm text-muted-foreground">
          Este acceso está protegido. No puedes modificar al propietario, tu
          propia cuenta ni otro administrador desde tu rol.
        </p>
      ) : (
        <form action={action} className="mt-6">
          <Feedback {...state} />
          <div className="mb-6 flex flex-wrap items-center gap-5">
            <label className="field">
              Rol
              <select
                name="role"
                value={role}
                onChange={(e) => setRole(e.target.value as Membership["role"])}
              >
                <option value="member">Miembro con permisos</option>
                {actor.role === "owner" && (
                  <option value="admin">Administrador</option>
                )}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="active"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
              />
              Acceso activo
            </label>
          </div>
          <p className="mb-4 text-xs leading-5 text-muted-foreground">
            Todos los módulos son seleccionables. Editar incluye consultar. Un
            administrador tiene acceso completo a la empresa. Los módulos en
            preparación respetarán estas selecciones cuando estén disponibles.
          </p>
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Módulo</th>
                  <th>Consultar</th>
                  <th>Editar</th>
                </tr>
              </thead>
              <tbody>
                {modules.map((m) => (
                  <tr key={m.id}>
                    <td>{m.label}</td>
                    <td>
                      <input
                        aria-label={`Consultar ${m.label}`}
                        type="checkbox"
                        name={`read:${m.id}`}
                        checked={permissions[m.id]?.includes("read") ?? false}
                        onChange={(e) => change(m.id, "read", e.target.checked)}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Editar ${m.label}`}
                        type="checkbox"
                        name={`write:${m.id}`}
                        checked={permissions[m.id]?.includes("write") ?? false}
                        onChange={(e) =>
                          change(m.id, "write", e.target.checked)
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-6">
            <SubmitButton>Guardar permisos</SubmitButton>
          </div>
        </form>
      )}
    </details>
  );
}
