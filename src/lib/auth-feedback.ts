import { invitationRequiredMessage } from "./registration";

export type AuthFailure = {
  code?: string;
  status?: number;
  name?: string;
};

// Use provider codes, never its message/body. Invalid credentials must not
// distinguish an unknown account from a wrong password.
export function authFailureMessage(
  mode: "login" | "register",
  error: AuthFailure,
) {
  if (error.status === 429 || error.code?.endsWith("_rate_limit"))
    return "Hay demasiados intentos. Espera unos minutos antes de volver a intentarlo.";
  if (mode === "login" && error.code === "email_not_confirmed")
    return "Tu correo aún no está confirmado. Abre el enlace de confirmación antes de iniciar sesión.";
  if (mode === "register" && error.code === "signup_invitation_required")
    return invitationRequiredMessage;
  if (mode === "register" && error.code === "weak_password")
    return "Elige una contraseña más segura, de al menos 12 caracteres.";
  if (mode === "register" && error.code === "signup_disabled")
    return "El registro está temporalmente cerrado. Si recibiste una invitación, consulta con su administrador.";
  if ((error.status ?? 0) >= 500 || error.name === "AuthRetryableFetchError")
    return "El servicio de acceso no está disponible. Inténtalo de nuevo más tarde.";
  return mode === "login"
    ? "El correo o la contraseña no son correctos. Revisa tus datos o recupera tu contraseña."
    : "No pudimos completar el registro. Inténtalo más tarde o consulta con el administrador de tu invitación.";
}

export function registrationConfirmationMessage(
  staging: boolean,
  smtpTest = false,
) {
  return staging && !smtpTest
    ? "Si tu cuenta está pendiente de confirmación, el enlace quedará en el receptor privado de pruebas. No se enviará un correo externo. Después de confirmar podrás iniciar sesión."
    : "Revisa tu correo y abre el enlace de confirmación en este mismo navegador. Si ya tienes una cuenta, inicia sesión.";
}
