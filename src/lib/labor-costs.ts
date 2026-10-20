import { createHash } from "node:crypto";

// Calculation only. Rates and project modes come from explicit dated records,
// never worker names, the current hourly rate or a customer's selling price.
export interface LaborEntry {
  external_id: string;
  worker_id: string;
  project_external_id: string;
  clock_in: number;
  clock_out?: number | null;
  minutes?: number | null;
  // An explicit Field value of zero must not be inferred from the clock.
  minutes_authoritative?: boolean;
  status: string;
  review_status?: string;
  req_status?: string;
}
export interface DailyLaborRate {
  from: string;
  to?: string | null;
  cents: number;
}
export interface LaborAgreement {
  id: string;
  workerId: string;
  amountCents: number;
  estimateId: string;
  revision: string;
}
export interface LaborInput {
  entries: LaborEntry[];
  rates: Record<string, DailyLaborRate[]>;
  projects: Record<string, { mode: "day" | "adjustment" }>;
  adjustments: Record<string, LaborAgreement>;
  splitRule?: "review" | "minutes";
  timezone?: string;
}
export interface LaborIssue {
  reason: string;
  entryId?: string;
  projectId?: string;
  workerId?: string;
  date?: string;
}
export interface LaborCost {
  id: string;
  kind: "DAILY" | "ADJUSTMENT";
  projectId: string;
  workerId: string;
  amountCents: number;
  date?: string;
  rateCents?: number;
  sources?: string[];
  estimateId?: string;
  revision?: string;
  crewIncluded?: boolean;
}
export interface LaborAttendance {
  entryId: string;
  workerId: string;
  projectId: string;
  date: string;
  minutes: number | null;
  mode: string;
  paidBy: string | null;
  includedInAdjustment: boolean;
}
const order = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const cents = (n: number) => Number.isSafeInteger(n) && n > 0;
const hash = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
function localDate(ts: number, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(ts * 1000));
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function allocateLaborCents(
  total: number,
  weights: Record<string, number>,
) {
  if (
    !cents(total) ||
    Object.values(weights).some((v) => !Number.isSafeInteger(v) || v < 0)
  )
    throw new Error("Invalid work duration");
  const keys = Object.keys(weights).sort(order);
  const sum = Object.values(weights).reduce((a, b) => a + BigInt(b), 0n);
  if (sum <= 0n) throw new Error("Invalid work duration");
  const out: Record<string, number> = {};
  const remainders = keys
    .map((key) => {
      const product = BigInt(total) * BigInt(weights[key]);
      out[key] = Number(product / sum);
      return { key, value: product % sum };
    })
    .sort((a, b) =>
      a.value > b.value ? -1 : a.value < b.value ? 1 : order(a.key, b.key),
    );
  let left = total - Object.values(out).reduce((a, b) => a + b, 0);
  for (const part of remainders) if (left-- > 0) out[part.key]++;
  return out;
}
export function previewLabor(input: LaborInput) {
  const splitRule = input.splitRule ?? "review",
    timezone = input.timezone ?? "America/New_York";
  if (!["review", "minutes"].includes(splitRule))
    throw new Error("Invalid split rule");
  const costs: LaborCost[] = [],
    attendance: LaborAttendance[] = [],
    pending: LaborIssue[] = [];
  const seen = new Map<string, string>(),
    agreements = new Set<string>();
  type Part = { minutes: number; mode: string; sources: string[] };
  const days = new Map<
    string,
    {
      workerId: string;
      date: string;
      projects: Map<string, Part>;
      blocked: boolean;
    }
  >();
  for (const [pid, project] of Object.entries(input.projects)) {
    if (!["day", "adjustment"].includes(project.mode))
      throw new Error("Invalid project labor mode");
    if (project.mode !== "adjustment") continue;
    const a = input.adjustments[pid];
    if (
      !a ||
      !cents(a.amountCents) ||
      !a.id ||
      !a.workerId ||
      !a.estimateId ||
      !a.revision
    ) {
      pending.push({ projectId: pid, reason: "ADJUSTMENT_SNAPSHOT_REQUIRED" });
      continue;
    }
    if (agreements.has(a.id))
      throw new Error("Agreement assigned to multiple projects");
    agreements.add(a.id);
    costs.push({
      id: "labor_adjustment_" + a.id,
      kind: "ADJUSTMENT",
      projectId: pid,
      workerId: a.workerId,
      amountCents: a.amountCents,
      estimateId: a.estimateId,
      revision: a.revision,
      crewIncluded: true,
    });
  }
  for (const e of input.entries) {
    if (!e.external_id) throw new Error("Missing entry ID");
    const fingerprint = hash(e),
      prior = seen.get(e.external_id);
    if (prior) {
      if (prior !== fingerprint) throw new Error("Conflicting duplicate entry");
      continue;
    }
    seen.set(e.external_id, fingerprint);
    if (e.status.toLowerCase() === "void") continue;
    const wid = e.worker_id,
      pid = e.project_external_id,
      ci = e.clock_in,
      co = e.clock_out ?? 0;
    if (!Number.isSafeInteger(ci) || ci <= 0 || !wid) {
      pending.push({ entryId: e.external_id, reason: "INVALID_ENTRY" });
      continue;
    }
    const date = localDate(ci, timezone),
      mode = input.projects[pid]?.mode ?? "review",
      key = JSON.stringify([wid, date]);
    if (!days.has(key))
      days.set(key, {
        workerId: wid,
        date,
        projects: new Map(),
        blocked: false,
      });
    const day = days.get(key)!;
    if (!day.projects.has(pid))
      day.projects.set(pid, { minutes: 0, mode, sources: [] });
    const part = day.projects.get(pid)!;
    part.sources.push(e.external_id);
    const valid =
      e.status.toLowerCase() === "closed" &&
      co > ci &&
      e.review_status?.toUpperCase() !== "NEEDS_REVIEW" &&
      e.req_status?.toUpperCase() !== "PENDING";
    let minutes = e.minutes ?? 0;
    if (valid && minutes <= 0 && !e.minutes_authoritative)
      minutes = Math.round((co - ci) / 60);
    if (!valid || !Number.isSafeInteger(minutes) || minutes <= 0) {
      pending.push({
        entryId: e.external_id,
        projectId: pid,
        workerId: wid,
        date,
        reason: "SHIFT_REVIEW_REQUIRED",
      });
      day.blocked = true;
    } else part.minutes += minutes;
    attendance.push({
      entryId: e.external_id,
      workerId: wid,
      projectId: pid,
      date,
      minutes: valid ? minutes : null,
      mode,
      paidBy:
        mode === "adjustment"
          ? (input.adjustments[pid]?.workerId ?? null)
          : null,
      includedInAdjustment: mode === "adjustment",
    });
  }
  for (const [, day] of [...days.entries()].sort(([a], [b]) => order(a, b))) {
    const parts = [...day.projects.entries()].sort(([a], [b]) => order(a, b));
    if (!parts.some(([, p]) => p.mode !== "adjustment") || day.blocked)
      continue;
    const ref = { workerId: day.workerId, date: day.date };
    if (parts.some(([, p]) => p.mode === "review")) {
      pending.push({ ...ref, reason: "PROJECT_MODE_REQUIRED" });
      continue;
    }
    if (parts.length > 1 && splitRule !== "minutes") {
      pending.push({ ...ref, reason: "SHARED_DAY_RULE_REQUIRED" });
      continue;
    }
    const matches = (input.rates[day.workerId] ?? []).filter(
      (r) => r.from && r.from <= day.date && (!r.to || r.to >= day.date),
    );
    if (matches.length !== 1 || !cents(matches[0].cents)) {
      pending.push({ ...ref, reason: "DATED_DAILY_RATE_REQUIRED" });
      continue;
    }
    const rate = matches[0].cents,
      allocations = allocateLaborCents(
        rate,
        Object.fromEntries(parts.map(([id, p]) => [id, p.minutes])),
      );
    for (const [pid, p] of parts) {
      if (p.mode === "adjustment") continue;
      costs.push({
        ...ref,
        id: "labor_day_" + hash([day.workerId, day.date, pid]).slice(0, 32),
        kind: "DAILY",
        projectId: pid,
        rateCents: rate,
        amountCents: allocations[pid],
        sources: [...p.sources].sort(order),
      });
    }
  }
  costs.sort((a, b) => order(a.id, b.id));
  const knownCostCents = costs.reduce((s, c) => s + c.amountCents, 0);
  if (!Number.isSafeInteger(knownCostCents))
    throw new Error("Labor total exceeds exact integer range");
  return {
    costs,
    attendance,
    pending,
    knownCostCents,
    complete: pending.length === 0,
    posted: false as const,
  };
}

export interface HistoricalLaborCost {
  id: string;
  workerId: string;
  projectId: string;
  date: string;
  amountCents: number;
}
// Historical costs stay in their original ledger. Only a reconciled supplement
// is returned here; this function never creates payroll or confirms payment.
export function reconcileDailyLabor(
  preview: ReturnType<typeof previewLabor>,
  historical: HistoricalLaborCost[],
) {
  const seen = new Map<string, string>(),
    unique: HistoricalLaborCost[] = [],
    pending = [...preview.pending];
  for (const h of historical) {
    if (
      !h.id ||
      !h.workerId ||
      !h.projectId ||
      !/^\d{4}-\d{2}-\d{2}$/.test(h.date) ||
      !cents(h.amountCents)
    )
      throw new Error("Invalid historical labor cost");
    const key = hash(h),
      prior = seen.get(h.id);
    if (prior) {
      if (prior !== key) throw new Error("Conflicting historical labor cost");
      continue;
    }
    seen.set(h.id, key);
    unique.push(h);
  }
  const matched = new Set<string>(),
    supplements: LaborCost[] = [];
  for (const c of preview.costs) {
    const matches = unique.filter(
      (h) =>
        h.projectId === c.projectId &&
        (c.kind === "ADJUSTMENT" ||
          (h.workerId === c.workerId && h.date === c.date)),
    );
    matches.forEach((h) => matched.add(h.id));
    const amount = matches.reduce((s, h) => s + h.amountCents, 0);
    if (!Number.isSafeInteger(amount))
      throw new Error("Historical total exceeds exact integer range");
    if (c.kind === "ADJUSTMENT" && matches.length) {
      pending.push({
        projectId: c.projectId,
        reason: "EXISTING_LABOR_RECONCILIATION_REQUIRED",
      });
      continue;
    }
    if (amount > c.amountCents) {
      pending.push({
        workerId: c.workerId,
        projectId: c.projectId,
        date: c.date,
        reason: "HISTORICAL_COST_EXCEEDS_DAILY_RATE",
      });
      continue;
    }
    if (amount < c.amountCents)
      supplements.push({ ...c, amountCents: c.amountCents - amount });
  }
  for (const h of unique)
    if (!matched.has(h.id))
      pending.push({
        workerId: h.workerId,
        projectId: h.projectId,
        date: h.date,
        reason: "HISTORICAL_LABOR_WITHOUT_VALUED_DAY",
      });
  const historicalCostCents = unique.reduce((s, h) => s + h.amountCents, 0),
    supplementCostCents = supplements.reduce((s, c) => s + c.amountCents, 0);
  if (!Number.isSafeInteger(historicalCostCents + supplementCostCents))
    throw new Error("Labor total exceeds exact integer range");
  return {
    supplements,
    historicalCostCents,
    supplementCostCents,
    knownCostCents: historicalCostCents + supplementCostCents,
    pending,
    complete: pending.length === 0,
    posted: false as const,
  };
}
