export type PunchGPS = {
  lat: number;
  lng: number;
  acc: number;
  gps_ts: number;
};

// ADT campoClockGpsError numeric, range and age boundaries, verified 2026-10-05.
function numeric(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (
    typeof value === "string" &&
    !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())
  )
    return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
export function normalizePunchGPS(
  value: unknown,
  now: number,
): PunchGPS | null {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !Number.isFinite(now)
  )
    return null;
  const data = value as Record<string, unknown>;
  const lat = numeric(data.lat),
    lng = numeric(data.lng),
    acc = numeric(data.acc),
    timestamp = numeric(data.gps_ts);
  if (
    lat === null ||
    lng === null ||
    acc === null ||
    timestamp === null ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180 ||
    (Math.abs(lat) < 0.0001 && Math.abs(lng) < 0.0001) ||
    acc <= 0 ||
    acc > 100 ||
    now - timestamp < -10000 ||
    now - timestamp > 60000
  )
    return null;
  return { lat, lng, acc: Math.round(acc), gps_ts: timestamp };
}
export function freshPosition(
  position: GeolocationPosition,
  requestedAt: number,
  now: number,
): PunchGPS | null {
  if (position.timestamp < requestedAt - 1000) return null;
  const gps = normalizePunchGPS(
    {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      acc: position.coords.accuracy,
      gps_ts: position.timestamp,
    },
    now,
  );
  return gps ? { ...gps, acc: Math.max(1, gps.acc) } : null;
}
export class GPSFailure extends Error {
  constructor(public readonly code: number) {
    super(
      code === 1
        ? "Permite la ubicación en Chrome y activa la ubicación del teléfono para marcar."
        : code === 4
          ? "La ubicación tiene poca precisión. Acércate a un lugar abierto e inténtalo otra vez."
          : "No se pudo verificar tu ubicación actual. Activa la ubicación e inténtalo otra vez.",
    );
  }
}
export const punchPositionOptions = {
  enableHighAccuracy: true,
  timeout: 15000,
  maximumAge: 0,
} as const;
export async function getPunchGPS(
  geolocation: Pick<Geolocation, "getCurrentPosition">,
  clock = Date.now,
): Promise<PunchGPS> {
  async function attempt(): Promise<PunchGPS> {
    const requestedAt = clock();
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (gps: PunchGPS | null, code: number) => {
        if (settled) return;
        settled = true;
        clearTimeout(watchdog);
        if (gps) resolve(gps);
        else reject(new GPSFailure(code));
      };
      const watchdog = setTimeout(() => finish(null, 3), 17500);
      try {
        geolocation.getCurrentPosition(
          (position) =>
            finish(freshPosition(position, requestedAt, clock()), 4),
          (error) => finish(null, error.code),
          punchPositionOptions,
        );
      } catch {
        finish(null, 2);
      }
    });
  }
  try {
    return await attempt();
  } catch (error) {
    if (error instanceof GPSFailure && error.code === 1) throw error;
    return attempt();
  }
}
