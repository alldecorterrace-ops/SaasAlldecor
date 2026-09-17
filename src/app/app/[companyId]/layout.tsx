import { companyContext } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
export const dynamic = "force-dynamic";
export default async function CompanyLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  const { company, member, user } = await companyContext(companyId);
  return (
    <AppShell company={company} member={member} email={user.email ?? ""}>
      {children}
    </AppShell>
  );
}
