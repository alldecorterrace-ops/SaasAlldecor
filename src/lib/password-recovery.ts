import { z } from "zod";

export type RecoveryState = { error?: string; success?: string };
export const recoveryEmailSchema = z.string().trim().max(254).pipe(z.email());
export const newPasswordSchema = z
  .object({
    password: z.string().min(12).max(128),
    confirmation: z.string().min(12).max(128),
  })
  .refine((value) => value.password === value.confirmation, {
    message: "Las contraseñas deben coincidir.",
  });

// Only this fixed local destination is accepted after a successful exchange.
export function authCallbackPath(destination: string | null) {
  return destination === "/actualizar-contrasena" ? destination : "/empresas";
}

type RecoveryAuth = {
  resetPasswordForEmail(
    email: string,
    options: { redirectTo: string },
  ): Promise<{
    error: { status?: number } | null;
  }>;
};

export async function sendRecoveryRequest(
  auth: RecoveryAuth,
  email: unknown,
  site: string,
): Promise<RecoveryState> {
  const parsed = recoveryEmailSchema.safeParse(email);
  if (!parsed.success) return { error: "Escribe un correo válido." };
  try {
    const callback = new URL("/auth/callback", site);
    callback.searchParams.set("next", "/actualizar-contrasena");
    const { error } = await auth.resetPasswordForEmail(parsed.data, {
      redirectTo: callback.href,
    });
    if (error?.status === 429)
      return {
        error:
          "Hay demasiadas solicitudes. Espera unos minutos e inténtalo de nuevo.",
      };
    // Do not distinguish unknown accounts from provider/account-specific errors.
    return {
      success:
        "Si el correo corresponde a una cuenta habilitada, recibirás un enlace para cambiar tu contraseña. Ábrelo en este mismo navegador.",
    };
  } catch {
    return {
      error: "No pudimos completar la solicitud. Inténtalo de nuevo más tarde.",
    };
  }
}

type PasswordAuth = {
  getUser(): Promise<{ data: { user: { id: string } | null }; error: unknown }>;
  updateUser(attributes: { password: string }): Promise<{ error: unknown }>;
};

export async function saveNewPassword(
  auth: PasswordAuth,
  input: unknown,
): Promise<RecoveryState> {
  const parsed = newPasswordSchema.safeParse(input);
  if (!parsed.success)
    return {
      error:
        "Usa al menos 12 caracteres y escribe la misma contraseña en ambos campos.",
    };
  const { data, error: userError } = await auth.getUser();
  if (userError || !data.user)
    return {
      error: "El acceso venció. Solicita un nuevo enlace de recuperación.",
    };
  const { error } = await auth.updateUser({ password: parsed.data.password });
  if (error)
    return {
      error:
        "No se pudo cambiar la contraseña. Usa una diferente a la anterior; si el enlace venció, solicita otro.",
    };
  return {
    success: "Contraseña actualizada. Ya puedes continuar a tus empresas.",
  };
}
