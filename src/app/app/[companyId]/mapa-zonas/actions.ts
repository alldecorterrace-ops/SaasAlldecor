"use server";
import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/auth";
import { missingZonePermissions } from "@/lib/commercial-zones";
import { geocoderConfig, lookupPostalCode } from "@/lib/postal-geocoder";
import { SqlitePostalLookupStore } from "@/lib/postal-geocoder-store";
import {
  locateMissingPostalCenter,
  type LocatePostalResult,
} from "@/lib/locate-postal-center";
import type { ZoneSource } from "@/lib/zone-analysis";

export async function locateCenter(
  companyId: string,
  zip: string,
): Promise<LocatePostalResult> {
  const { db, member } = await requireModule(companyId, "mapazonas", "write");
  if (missingZonePermissions(member).length) return { status: "forbidden" };
  const result = await locateMissingPostalCenter(zip, {
    source: async () => {
      const { data, error } = await db.rpc("commercial_zone_source", {
        p_company: companyId,
      });
      return !error && data ? (data as ZoneSource) : null;
    },
    lookup: async (postalCode) => {
      const config = geocoderConfig(process.env);
      let store: SqlitePostalLookupStore | undefined;
      try {
        if (config.provider === "nominatim")
          store = new SqlitePostalLookupStore(config.directory);
        return await lookupPostalCode(postalCode, config, store);
      } catch {
        return { status: "unavailable" };
      } finally {
        store?.close();
      }
    },
    save: async (postalCode, point, city) => {
      const { error } = await db.rpc("save_postal_center", {
        p_company: companyId,
        p_zip: postalCode,
        p_lat: point.lat,
        p_lng: point.lng,
        p_city: city,
        p_version: 0,
      });
      if (!error) return "saved";
      return error.code === "PT409"
        ? "conflict"
        : error.code === "42501"
          ? "forbidden"
          : "unavailable";
    },
  });
  if (result.status === "saved" || result.status === "already_saved")
    revalidatePath(`/app/${companyId}/mapa-zonas`);
  return result;
}
