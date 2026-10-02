export type CartographyStatus = "loading" | "ready" | "unavailable";
type Clock = {
  schedule: (action: () => void, delay: number) => unknown;
  cancel: (timer: unknown) => void;
};

// One visible viewport at a time; no background retries or cache-busting URLs.
export function monitorCartography(
  update: (state: CartographyStatus) => void,
  clock: Clock,
  timeout = 15_000,
) {
  let live = true,
    errors = false,
    timer: unknown;
  const clear = () => {
    if (timer !== undefined) clock.cancel(timer);
    timer = undefined;
  };
  return {
    loading() {
      if (!live) return;
      errors = false;
      clear();
      update("loading");
      timer = clock.schedule(() => {
        timer = undefined;
        if (live) update("unavailable");
      }, timeout);
    },
    tileerror() {
      if (!live) return;
      errors = true;
      clear();
      update("unavailable");
    },
    load() {
      if (!live) return;
      clear();
      update(errors ? "unavailable" : "ready");
    },
    stop() {
      live = false;
      clear();
    },
  };
}
