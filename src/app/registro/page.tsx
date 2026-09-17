import { AuthForm } from "@/components/auth-form";
import { isConfigured } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
export default function Register() {
  if (!isConfigured()) redirect("/configuracion-inicial");
  return <AuthForm mode="register" />;
}
