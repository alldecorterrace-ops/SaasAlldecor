"use client";
import { useActionState } from "react";
import {
  inventoryMutation,
  type InvState,
} from "@/app/app/[companyId]/inventario/actions";
import { Button } from "@/components/ui/button";
export function InventoryForm({
  company,
  operation,
  slug,
  request,
  id,
  version,
  submit,
  children,
  disabled = false,
}: {
  company: string;
  operation: string;
  slug: string;
  request: string;
  id?: string | null;
  version?: number;
  submit: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  const [state, action, pending] = useActionState(
    inventoryMutation.bind(null, company, operation, slug),
    {} as InvState,
  );
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="request" value={request} />
      <input type="hidden" name="id" value={id ?? ""} />
      <input type="hidden" name="version" value={version ?? 0} />
      {children}
      {state.error && (
        <p role="alert" className="rounded-lg border p-3 text-sm text-red-700">
          {state.error}
        </p>
      )}
      <div>
        <Button type="submit" disabled={pending || disabled}>
          {pending ? "Guardando…" : submit}
        </Button>
      </div>
    </form>
  );
}
