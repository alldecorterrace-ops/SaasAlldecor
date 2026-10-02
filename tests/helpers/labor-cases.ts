import {
  previewLabor,
  type LaborInput,
  type LaborEntry,
} from "../../src/lib/labor-costs";
const p = "11111111-1111-4111-8111-111111111111",
  q = "22222222-2222-4222-8222-222222222222",
  worker = "33333333-3333-4333-8333-333333333333";
export const laborIds = { p, q, worker };
export function laborBase(): LaborInput {
  return {
    entries: [
      {
        external_id: "qa-shift-1",
        worker_id: worker,
        project_external_id: p,
        clock_in: Date.parse("2026-10-01T13:00:00Z") / 1000,
        clock_out: Date.parse("2026-10-01T21:00:00Z") / 1000,
        minutes: 450,
        status: "closed",
        review_status: "OK",
        req_status: "",
      },
    ],
    rates: { [worker]: [{ from: "2026-01-01", cents: 25000 }] },
    projects: { [p]: { mode: "day" } },
    adjustments: {},
  };
}
const cases: Array<{ name: string; input: LaborInput; actual: unknown }> = [];
function add(name: string, change: (i: LaborInput) => void = () => {}) {
  const input = laborBase();
  change(input);
  let actual: unknown;
  try {
    actual = { result: previewLabor(input) };
  } catch {
    actual = { error: true };
  }
  cases.push({ name, input, actual });
}
const shift = (i: LaborInput, changes: Partial<LaborEntry>) =>
  Object.assign(i.entries[0], changes);
add("one reviewed net workday");
add("short reviewed workday is one day", (i) =>
  shift(i, { minutes: 30, clock_out: i.entries[0].clock_in + 1800 }),
);
add("repeated same shift", (i) => i.entries.push({ ...i.entries[0] }));
add("conflicting same shift", (i) =>
  i.entries.push({ ...i.entries[0], minutes: 400 }),
);
add("missing shift id", (i) => shift(i, { external_id: "" }));
add("void shift", (i) => shift(i, { status: "VOID" }));
add("invalid start", (i) => shift(i, { clock_in: 0 }));
add("missing worker", (i) => shift(i, { worker_id: "" }));
add("open shift", (i) => shift(i, { status: "open", clock_out: null }));
add("review required", (i) => shift(i, { review_status: "NEEDS_REVIEW" }));
add("correction request pending", (i) => shift(i, { req_status: "PENDING" }));
add("end equals start", (i) => shift(i, { clock_out: i.entries[0].clock_in }));
add("derive minutes from duration", (i) => shift(i, { minutes: 0 }));
add("derive minutes from negative legacy value", (i) =>
  shift(i, { minutes: -1 }),
);
add("round duration 30 seconds", (i) =>
  shift(i, { minutes: 0, clock_out: i.entries[0].clock_in + 30 }),
);
add("round duration 29 seconds", (i) =>
  shift(i, { minutes: 0, clock_out: i.entries[0].clock_in + 29 }),
);
add("no rates", (i) => (i.rates = {}));
add("zero rate", (i) => (i.rates[worker][0].cents = 0));
add("negative rate", (i) => (i.rates[worker][0].cents = -1));
add("fractional cent rate", (i) => (i.rates[worker][0].cents = 25000.5));
add("overlapping effective rates", (i) =>
  i.rates[worker].push({ from: "2026-09-01", cents: 26000 }),
);
add(
  "first effective day included",
  (i) => (i.rates[worker][0].from = "2026-10-01"),
);
add(
  "last effective day included",
  (i) => (i.rates[worker][0].to = "2026-10-01"),
);
add("expired effective rate", (i) => (i.rates[worker][0].to = "2026-09-30"));
add("future effective rate", (i) => (i.rates[worker][0].from = "2026-10-02"));
add("rate changes next day", (i) => {
  i.rates[worker] = [
    { from: "2026-01-01", to: "2026-10-01", cents: 25000 },
    { from: "2026-10-02", cents: 26000 },
  ];
  i.entries.push({
    ...i.entries[0],
    external_id: "qa-shift-next",
    clock_in: i.entries[0].clock_in + 86400,
    clock_out: i.entries[0].clock_out! + 86400,
  });
});
add("project mode absent", (i) => (i.projects = {}));
add(
  "invalid project mode",
  (i) => (i.projects[p] = { mode: "other" as "day" }),
);
add("two shifts same day one wage", (i) =>
  i.entries.push({
    ...i.entries[0],
    external_id: "qa-shift-2",
    clock_in: i.entries[0].clock_out! + 60,
    clock_out: i.entries[0].clock_out! + 3660,
    minutes: 60,
  }),
);
function second(i: LaborInput, minutes = 150) {
  i.projects[q] = { mode: "day" };
  i.entries.push({
    ...i.entries[0],
    external_id: "qa-shift-2",
    project_external_id: q,
    clock_in: i.entries[0].clock_out! + 60,
    clock_out: i.entries[0].clock_out! + minutes * 60 + 60,
    minutes,
  });
}
add("shared day requires decision", (i) => second(i));
add("explicit net minutes allocation", (i) => {
  second(i);
  i.splitRule = "minutes";
});
add("allocation with remainder", (i) => {
  second(i, 450);
  i.splitRule = "minutes";
  i.rates[worker][0].cents = 25001;
});
add("invalid split policy", (i) => (i.splitRule = "other" as "review"));
function adjustment(i: LaborInput, project = p) {
  i.projects[project] = { mode: "adjustment" };
  i.adjustments[project] = {
    id: "qa-agreement",
    workerId: worker,
    amountCents: 609000,
    estimateId: "qa-saved-estimate",
    revision: "qa-snapshot-1",
  };
}
add("whole crew included in adjustment", (i) => adjustment(i));
add("no hourly or daily add on to adjustment", (i) => {
  adjustment(i);
  i.entries.push({
    ...i.entries[0],
    external_id: "qa-crew",
    worker_id: "44444444-4444-4444-8444-444444444444",
  });
});
add(
  "adjustment missing snapshot",
  (i) => (i.projects[p] = { mode: "adjustment" }),
);
for (const key of ["id", "workerId", "estimateId", "revision"] as const)
  add("adjustment missing " + key, (i) => {
    adjustment(i);
    i.adjustments[p][key] = "";
  });
for (const amount of [0, -100, 100.5])
  add("adjustment amount " + amount, (i) => {
    adjustment(i);
    i.adjustments[p].amountCents = amount;
  });
add("agreement reused across projects", (i) => {
  adjustment(i);
  adjustment(i, q);
});
add("mixed day and adjustment requires decision", (i) => {
  second(i);
  adjustment(i, q);
});
add("explicit mixed allocation excludes crew add on", (i) => {
  second(i);
  adjustment(i, q);
  i.splitRule = "minutes";
});
add("unreviewed part blocks whole daily wage", (i) => {
  second(i);
  i.splitRule = "minutes";
  i.entries[1].review_status = "NEEDS_REVIEW";
});
add("UTC date uses company local start", (i) =>
  shift(i, {
    clock_in: Date.parse("2026-10-02T02:00:00Z") / 1000,
    clock_out: Date.parse("2026-10-02T03:00:00Z") / 1000,
    minutes: 60,
  }),
);
add("DST transition local day", (i) =>
  shift(i, {
    clock_in: Date.parse("2026-11-01T05:30:00Z") / 1000,
    clock_out: Date.parse("2026-11-01T07:30:00Z") / 1000,
    minutes: 120,
  }),
);
add("two workers independent days", (i) => {
  const w = "44444444-4444-4444-8444-444444444444";
  i.entries.push({
    ...i.entries[0],
    external_id: "qa-other-worker",
    worker_id: w,
  });
  i.rates[w] = [{ from: "2026-01-01", cents: 20000 }];
});
export const laborReferenceCases = cases;
