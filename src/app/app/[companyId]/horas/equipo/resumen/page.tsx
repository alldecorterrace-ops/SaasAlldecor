import { HoursSummary } from "@/components/hours-summary";
export default async function TeamHoursSummary(props: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return HoursSummary({ ...props, scope: "team" });
}
