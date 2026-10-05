"use client";
import { usePreservedActionState } from "./use-preserved-action-state";
import {
  approveTeamTime,
  type TimeApprovalState,
} from "@/app/app/[companyId]/horas/equipo/revision/actions";
import { Button } from "./ui/button";
import { Feedback } from "./feedback";
export function WorkforceTimeApprovalForm({
  company,
  entry,
  version,
  minutes,
  request,
}: {
  company: string;
  entry: string;
  version: number;
  minutes: number;
  request: string;
}) {
  const [state, action, pending, onReset] = usePreservedActionState(
    approveTeamTime.bind(null, company),
    {} as TimeApprovalState,
  );
  return (
    <form action={action} onReset={onReset} className="space-y-3 mt-4">
      <Feedback error={state.error} success={state.success} />
      <input type="hidden" name="request" value={request} />
      <input type="hidden" name="entry" value={entry} />
      <input type="hidden" name="version" value={version} />
      <Button type="submit" disabled={pending}>
        {pending ? "Aprobando…" : `Aprobar turno · ${minutes} min`}
      </Button>
    </form>
  );
}
