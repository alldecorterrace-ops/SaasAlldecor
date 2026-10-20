import { redirect } from "next/navigation";
import { forwardAuthCallback } from "@/lib/auth-callback";
import type { Metadata } from "next";
import { PublicLanding } from "@/components/marketing/public-landing";

export const metadata: Metadata = {
  title: "All Decor | Clientes, proyectos y equipo en un solo lugar",
  description:
    "Organiza clientes, estimados, facturas, gastos y equipo con All Decor. Gestiona tus empresas con permisos por usuario y planes desde $29.99 USD al mes.",
  alternates: { canonical: "https://app.alldecorpatio.com/" },
  robots: {
    index: process.env.APP_ENVIRONMENT === "production",
    follow: process.env.APP_ENVIRONMENT === "production",
  },
  openGraph: {
    type: "website",
    locale: "es_US",
    url: "https://app.alldecorpatio.com/",
    siteName: "All Decor",
    title: "Menos pendientes. Más negocio. | All Decor",
    description:
      "Clientes, estimados, facturas y equipo. Un espacio para conectar tu operación.",
  },
};
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const callback = forwardAuthCallback(await searchParams);
  if (callback) redirect(callback);
  return <PublicLanding />;
}
