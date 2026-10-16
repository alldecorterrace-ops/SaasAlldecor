import { redirect } from "next/navigation";
import { forwardAuthCallback } from "@/lib/auth-callback";
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const callback = forwardAuthCallback(await searchParams);
  if (callback) redirect(callback);
  redirect("/empresas");
}
