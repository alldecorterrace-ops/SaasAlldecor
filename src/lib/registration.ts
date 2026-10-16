export const invitationRequiredMessage =
  "Para crear una cuenta necesitas una invitación vigente o un plan pagado y verificado. Usa el correo de la invitación o de la compra; si ya tienes cuenta, inicia sesión.";

export async function checkRegistrationInvitation(
  lookup: () => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<{ error?: string }> {
  try {
    const { data, error } = await lookup();
    if (error)
      return {
        error: "No pudimos comprobar tu acceso. Inténtalo más tarde.",
      };
    return data === true ? {} : { error: invitationRequiredMessage };
  } catch {
    return {
      error: "No pudimos comprobar tu acceso. Inténtalo más tarde.",
    };
  }
}
