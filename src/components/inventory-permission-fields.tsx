import { inventoryPermissions } from "@/lib/inventory-permissions";

export function InventoryPermissionFields({
  permissions = {},
}: {
  permissions?: Record<string, string[]>;
}) {
  return (
    <fieldset className="mt-5 grid gap-3">
      <legend className="mb-2 text-sm font-semibold">
        Compras y catálogo físico
      </legend>
      {inventoryPermissions.map((entry) => (
        <div key={entry.id} className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {(["read", "write"] as const).map(
            (action) =>
              entry[action] && (
                <label key={action} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name={`${action}:${entry.id}`}
                    defaultChecked={
                      permissions[entry.id]?.includes(action) ?? false
                    }
                  />
                  {entry[action]}
                </label>
              ),
          )}
        </div>
      ))}
    </fieldset>
  );
}
