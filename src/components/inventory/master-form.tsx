import { InventoryForm } from "./form";
import { Input } from "@/components/ui/input";
import { inventoryActions, type Master, type TeamRow } from "@/lib/inventory";
import { randomUUID } from "node:crypto";
export function MasterForm({
  company,
  slug,
  row,
}: {
  company: string;
  slug: "proveedores" | "ubicaciones";
  row?: Master;
}) {
  const loc = slug === "ubicaciones",
    d = row?.data;
  return (
    <InventoryForm
      company={company}
      operation="master"
      slug={slug}
      id={row?.id}
      version={d?.version}
      request={randomUUID()}
      submit={
        row ? "Guardar cambios" : loc ? "Crear ubicación" : "Crear proveedor"
      }
    >
      <label className="field">
        Nombre
        <Input name="name" required maxLength={190} defaultValue={row?.name} />
      </label>
      {loc ? (
        <>
          <label className="field">
            Tipo
            {row ? (
              <>
                <input type="hidden" name="kind" value={d?.kind} />
                <span>{d?.kind}</span>
              </>
            ) : (
              <select name="kind">
                <option value="ALMACEN">Almacén</option>
                <option value="TIENDA">Tienda</option>
              </select>
            )}
          </label>
          <label className="field">
            Ciudad o provincia
            <Input name="city" defaultValue={d?.city} />
          </label>
        </>
      ) : (
        <>
          <label className="field">
            Identificación fiscal
            <Input
              name="tax_identifier"
              defaultValue={d?.tax_identifier ?? ""}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="field">
              Teléfono
              <Input name="phone" type="tel" defaultValue={d?.phone ?? ""} />
            </label>
            <label className="field">
              Correo
              <Input name="email" type="email" defaultValue={d?.email ?? ""} />
            </label>
          </div>
          <label className="field">
            Notas
            <textarea name="notes" rows={2} defaultValue={d?.notes ?? ""} />
          </label>
        </>
      )}
      <label className="field">
        Dirección
        <Input name="address" defaultValue={d?.address ?? ""} />
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          name="active"
          defaultChecked={d?.active ?? true}
        />
        Disponible para operaciones nuevas
      </label>
      {row && loc && (
        <label className="flex items-center gap-2">
          <input type="checkbox" name="remove" />
          Retirar esta ubicación si está vacía
        </label>
      )}
    </InventoryForm>
  );
}
export function LocationTeam({
  company,
  location,
  team,
}: {
  company: string;
  location: string;
  team: TeamRow[];
}) {
  return (
    <section className="card grid gap-3">
      <h2 className="font-semibold">Equipo de esta ubicación</h2>
      {team.length === 0 && (
        <p className="text-sm">
          La empresa todavía no tiene empleados asignables.
        </p>
      )}
      {team.map((u) => (
        <details key={u.user_id}>
          <summary className="cursor-pointer">
            {u.email} · {u.assigned ? "Asignado" : "Sin asignar"}
          </summary>
          <InventoryForm
            company={company}
            request={randomUUID()}
            operation="access"
            slug="ubicaciones"
            id={location}
            submit="Guardar acceso"
          >
            <input type="hidden" name="user" value={u.user_id} />
            <label>
              <input
                type="checkbox"
                name="assigned"
                defaultChecked={u.assigned}
              />{" "}
              Asignar ubicación y consulta de existencias
            </label>
            {Object.entries(inventoryActions).map(([key, label]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  name="actions"
                  value={key}
                  defaultChecked={u.actions.includes(key)}
                />{" "}
                {label}
              </label>
            ))}
          </InventoryForm>
        </details>
      ))}
    </section>
  );
}
