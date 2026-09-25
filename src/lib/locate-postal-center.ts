import { analyzeAdtZones, type ZoneSource } from "./zone-analysis";
import type { PostalLookup, PostalPoint } from "./postal-geocoder";

export type LocatePostalResult =
  | Exclude<PostalLookup, { status: "found" }>
  | {
      status: "saved" | "already_saved" | "conflict" | "forbidden" | "invalid";
    };

export async function locateMissingPostalCenter(
  zip: string,
  dependencies: {
    // Must authenticate AND require map write plus every commercial-source read.
    source: () => Promise<ZoneSource | null>;
    lookup: (zip: string) => Promise<PostalLookup>;
    save: (
      zip: string,
      point: PostalPoint,
      city: string,
    ) => Promise<"saved" | "conflict" | "forbidden" | "unavailable">;
  },
): Promise<LocatePostalResult> {
  if (!/^\d{5}$/.test(zip)) return { status: "invalid" };
  const source = await dependencies.source();
  if (!source) return { status: "forbidden" };
  if (source.postalCenters.some((p) => p.zip === zip))
    return { status: "already_saved" };
  const missing = analyzeAdtZones(source).zips_faltantes.find(
    (z) => String(z.zip) === zip,
  );
  // Not a general geocoder: only current missing ZIPs in this authorized report.
  if (!missing) return { status: "invalid" };
  const result = await dependencies.lookup(zip);
  if (result.status !== "found") return result;
  // Save with version=0 at the caller; a concurrent manual correction always wins.
  return { status: await dependencies.save(zip, result.point, missing.ciudad) };
}
