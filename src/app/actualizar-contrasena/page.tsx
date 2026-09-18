import { requireUser } from "@/lib/auth";
import { PasswordForm } from "@/components/password-form";
export default async function UpdatePassword() {
  await requireUser();
  return <PasswordForm mode="update" />;
}
