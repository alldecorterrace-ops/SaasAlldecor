import { z } from "zod";
import { uuid } from "./validation";
import { workKinds } from "./workspaces";
export const workRequestResult = z.object({
  id: uuid,
  recordId: uuid,
  version: z.number().int().positive(),
  operation: z.enum(["save", "movement", "attachment"]),
  kind: z.enum(workKinds),
  status: z.string(),
});
export function parseWorkIdentity(form: FormData) {
  const id = uuid.safeParse(form.get("request"));
  return id.success ? id.data : null;
}
export function confirmedWorkResult(
  value: unknown,
  kind: string,
  operation: string,
  recordId: string,
  effectId: string,
) {
  const parsed = workRequestResult.safeParse(value);
  return (
    parsed.success &&
    parsed.data.kind === kind &&
    parsed.data.operation === operation &&
    parsed.data.recordId === recordId &&
    parsed.data.id === effectId
  );
}
