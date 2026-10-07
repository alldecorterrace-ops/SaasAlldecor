import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireUser } from "./auth";
const context = z.object({
  role: z.enum(["administrator", "manager"]),
  active: z.boolean(),
  can_create_company: z.boolean(),
});
export const platformContext = cache(async () => {
  const { db, user } = await requireUser();
  const { data, error } = await db.rpc("platform_context");
  if (error) throw new Error("No se pudo comprobar el acceso al SaaS.");
  return { db, user, platform: data?.length ? context.parse(data[0]) : null };
});
export async function requirePlatformAdministrator() {
  const value = await platformContext();
  if (value.platform?.role !== "administrator" || !value.platform.active)
    notFound();
  return value;
}
