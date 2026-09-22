import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: { default: "All Decor · Workspace", template: "%s · All Decor" },
  description: "Tu equipo, tus clientes y tus proyectos en un solo lugar.",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>
        {process.env.APP_ENVIRONMENT === "staging" && (
          <div
            role="status"
            className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-950"
          >
            Entorno de pruebas · Datos ficticios · Envíos externos desactivados
          </div>
        )}
        {children}
      </body>
    </html>
  );
}
