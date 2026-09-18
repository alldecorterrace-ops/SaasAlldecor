export function createHealthCheck(
  probe: () => Promise<boolean>,
  now: () => number = Date.now,
) {
  let cached: { ok: boolean; until: number } | undefined;
  let pending: Promise<boolean> | undefined;
  return async () => {
    if (cached && now() < cached.until) return cached.ok;
    if (!pending) {
      pending = Promise.resolve()
        .then(probe)
        .catch(() => false)
        .then((ok) => {
          cached = { ok, until: now() + (ok ? 15000 : 5000) };
          return ok;
        })
        .finally(() => {
          pending = undefined;
        });
    }
    return pending;
  };
}
