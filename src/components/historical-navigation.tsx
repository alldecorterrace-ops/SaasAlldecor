import Link from "next/link";
import { canAccess, type Membership } from "@/lib/modules";
import { historicalKinds, historicalSections } from "@/lib/historical-business";
export function HistoricalNavigation({
  companyId,
  member,
}: {
  companyId: string;
  member: Membership;
}) {
  return (
    <nav
      aria-label="Histórico ADT"
      className="flex flex-wrap gap-3 text-sm mb-6"
    >
      {canAccess(member, "fin-estimados") && (
        <Link
          className="text-primary underline"
          href={`/app/${companyId}/estimados/historico`}
        >
          Estimados históricos
        </Link>
      )}
      {historicalKinds
        .filter((kind) => canAccess(member, historicalSections[kind].module))
        .map((kind) => (
          <Link
            key={kind}
            className="text-primary underline"
            href={`/app/${companyId}/historico/${kind}`}
          >
            {historicalSections[kind].label} históricos
          </Link>
        ))}
    </nav>
  );
}
