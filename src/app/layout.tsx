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
      <body>{children}</body>
    </html>
  );
}
