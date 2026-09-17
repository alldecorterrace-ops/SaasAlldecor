"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto max-w-lg px-6 py-24">
      <h1 className="page-title">No pudimos cargar esta página</h1>
      <p className="my-5 text-muted-foreground">
        Comprueba la conexión e inténtalo de nuevo. Tus datos guardados se
        conservan.
      </p>
      <Button onClick={reset}>Reintentar</Button>
    </main>
  );
}
