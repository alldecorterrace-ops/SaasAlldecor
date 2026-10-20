import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
const jakarta = localFont({
  src: "../../public/fonts/PlusJakartaSans-Variable.ttf",
  display: "swap",
  weight: "200 800",
  variable: "--font-jakarta",
});
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
    <html lang="es" className={jakarta.variable}>
      <body>
        {process.env.APP_ENVIRONMENT === "staging" && (
          <div
            role="status"
            className="relative z-10 border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs font-medium text-amber-950 print:hidden"
          >
            Entorno de pruebas · Datos ficticios · Envíos de correo restringidos
          </div>
        )}
        {children}
      </body>
    </html>
  );
}
