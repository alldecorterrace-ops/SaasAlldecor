import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, isConfigured } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
export default async function SubscriptionCompleted() {
  if (isConfigured()) {
    const db = await createClient();
    const {
      data: { user },
    } = await db.auth.getUser();
    if (user?.email_confirmed_at) {
      const { data, error } = await db.rpc("activate_my_paid_companies");
      if (!error && typeof data === "number" && data > 0) redirect("/empresas");
    }
  }
  return (
    <main className="mx-auto max-w-xl px-6 py-20">
      <p className="eyebrow">El siguiente paso</p>
      <h1 className="page-title mt-4">Activa el acceso a tu empresa</h1>
      <p className="mt-6 leading-7 text-muted-foreground">
        Estamos comprobando el resultado del pago. Para activar la empresa, crea
        tu contraseña con el correo que usaste en la compra y confirma ese
        correo. Si ya tienes cuenta, inicia sesión.
      </p>
      <p className="mt-4 text-sm text-muted-foreground">
        La empresa se crea una sola vez cuando el servidor verifica el pago y tu
        correo. Si todavía no puedes registrarte, espera unos momentos y vuelve
        a intentarlo; regresar a esta página por sí solo no activa un plan.
      </p>
      <div className="mt-8 flex flex-wrap gap-4">
        <Link
          className="rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground"
          href="/registro"
        >
          Crear mi contraseña
        </Link>
        <Link
          className="rounded-xl border px-5 py-3 font-semibold"
          href="/login"
        >
          Ya tengo cuenta
        </Link>
      </div>
    </main>
  );
}
