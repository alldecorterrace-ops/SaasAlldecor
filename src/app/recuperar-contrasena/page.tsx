import { redirect } from "next/navigation";
import { isConfigured } from "@/lib/supabase/server";
import { PasswordForm } from "@/components/password-form";
export default function RecoverPassword() {
  if (!isConfigured()) redirect("/configuracion-inicial");
  return <PasswordForm mode="request" />;
}
