import { AuthForm } from "@/components/auth-form";
import { isConfigured } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (!isConfigured()) redirect("/configuracion-inicial");
  return <AuthForm mode="login" error={(await searchParams).error} />;
}
