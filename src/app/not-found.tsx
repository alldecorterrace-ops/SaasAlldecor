import Link from "next/link";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
export default function NotFound() {
  return (
    <main className="mx-auto max-w-lg px-6 py-24">
      <Brand className="mb-8" />
      <h1 className="page-title mt-4">Página no disponible</h1>
      <p className="my-5 text-muted-foreground">
        No encontramos este recurso entre las empresas y funciones a las que
        tienes acceso.
      </p>
      <Button asChild variant="outline">
        <Link href="/empresas">Volver a mis empresas</Link>
      </Button>
    </main>
  );
}
