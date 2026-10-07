export const invitationRequiredMessage =
  "Para crear una cuenta necesitas una invitación vigente. Usa el correo al que te invitaron; si no tienes invitación, contacta al administrador o al gerente de tu empresa.";

export async function checkRegistrationInvitation(
  lookup: () => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<{ error?: string }> {
  try {
    const { data, error } = await lookup();
    if (error)
      return {
        error: "No pudimos comprobar la invitación. Inténtalo más tarde.",
      };
    return data === true ? {} : { error: invitationRequiredMessage };
  } catch {
    return {
      error: "No pudimos comprobar la invitación. Inténtalo más tarde.",
    };
  }
}
