import Link from "next/link";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { redirect } from "next/navigation";
import { createClient, isConfigured } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
export default async function SubscriptionCompleted() {
  let signedIn = false;
  if (isConfigured()) {
    const db = await createClient();
    const {
      data: { user },
    } = await db.auth.getUser();
    if (user?.email_confirmed_at) {
      signedIn = true;
      const { data, error } = await db.rpc("activate_my_paid_companies");
      if (!error && typeof data === "number" && data > 0) redirect("/empresas");
    }
  }
  return (
    <main className="mx-auto max-w-xl px-6 py-20">
      <Brand className="mb-8" />
      <p className="eyebrow">El siguiente paso</p>
      <h1 className="page-title mt-4">
        {signedIn
          ? "Continúa con tus empresas"
          : "Activa el acceso a tu empresa"}
      </h1>
      <p className="mt-6 leading-7 text-muted-foreground">
        {signedIn
          ? "Tu sesión sigue abierta. En Tus empresas puedes revisar la activación de tu plan. Si Stripe todavía está confirmando el pago, vuelve a comprobarlo en unos momentos."
          : "Estamos comprobando el resultado del pago. Para activar la empresa, crea tu contraseña con el correo que usaste en la compra y confirma ese correo. Si ya tienes cuenta, inicia sesión."}
      </p>
      <p className="mt-4 text-sm text-muted-foreground">
        La empresa se crea una sola vez cuando el servidor verifica el pago y tu
        correo. Regresar a esta página por sí solo no activa un plan.
      </p>
      <div className="mt-8 flex flex-wrap gap-4">
        <Button asChild>
          <Link href={signedIn ? "/empresas" : "/registro"}>
            {signedIn ? "Ir a mis empresas" : "Crear mi contraseña"}
          </Link>
        </Button>
        {!signedIn && (
          <Button asChild variant="outline">
            <Link href="/login">Ya tengo cuenta</Link>
          </Button>
        )}
      </div>
    </main>
  );
}
