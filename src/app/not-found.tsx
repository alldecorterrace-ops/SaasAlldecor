import Link from "next/link";
export default function NotFound() {
  return (
    <main className="mx-auto max-w-lg px-6 py-24">
      <p className="eyebrow">All Decor</p>
      <h1 className="page-title mt-4">Página no disponible</h1>
      <p className="my-5 text-muted-foreground">
        No encontramos este recurso entre las empresas y funciones a las que
        tienes acceso.
      </p>
      <Link href="/empresas" className="underline">
        Volver a mis empresas
      </Link>
    </main>
  );
}
