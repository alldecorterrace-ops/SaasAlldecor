import "server-only";
import { cache } from "react";
import { redirect, notFound } from "next/navigation";
import { createClient, isConfigured } from "./supabase/server";
import { canAccess, type Membership } from "./modules";
import { uuid } from "./validation";
export const requireUser = cache(async () => {
  if (!isConfigured()) redirect("/configuracion-inicial");
  const db = await createClient();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) redirect("/login");
  return { db, user: data.user };
});
export const companyContext = cache(async (companyId: string) => {
  if (!uuid.safeParse(companyId).success) notFound();
  const { db, user } = await requireUser();
  const { data: member, error } = await db
    .from("memberships")
    .select("*")
    .eq("company_id", companyId)
    .eq("user_id", user.id)
    .eq("active", true)
    .maybeSingle();
  if (error) throw new Error("No se pudo comprobar el acceso a la empresa.");
  if (!member) notFound();
  const { data: company, error: companyError } = await db
    .from("companies")
    .select("id,name,timezone")
    .eq("id", companyId)
    .single();
  if (companyError || !company)
    throw new Error("No se pudo cargar la empresa.");
  return { db, user, member: member as Membership, company };
});
export async function requireModule(
  companyId: string,
  module: string,
  action: "read" | "write" = "read",
) {
  const context = await companyContext(companyId);
  if (!canAccess(context.member, module, action)) notFound();
  return context;
}
