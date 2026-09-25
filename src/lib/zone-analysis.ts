// Compatibility calculation for ADT's mapaZonas, independent of persistence.
// The source contract deliberately distinguishes webform leads from all CRM leads.
export type ZoneContact = {
  full_name: string;
  address: string;
  city: string;
  postal_code: string;
  phone: string;
  email: string;
};
export type ZoneSource = {
  customers: (ZoneContact & { external_id: string })[];
  invoices: {
    client_external_id: string;
    paid_amount: string | number;
    balance_due: string | number;
    status: string;
  }[];
  webformLeads: (ZoneContact & { id: string })[];
  leadStatuses: { lead_id: string; status: string }[];
  postalCenters: { zip: string; lat: number; lng: number; ciudad: string }[];
};
export const zoneCategories = {
  terminado: "Proyecto terminado",
  activo: "Proyecto activo",
  estimado: "Estimado",
  lead: "Lead",
} as const;
export type ZoneCategory = keyof typeof zoneCategories;
type Counts = Record<ZoneCategory, number>;
export type ZoneAggregate = Counts & {
  zip: string;
  ciudad: string;
  ingresos: number;
  contactos: number;
  cerrados: number;
  cierre: number;
  ticket: number;
};
export type ZonePoint = {
  t: ZoneCategory;
  n: string;
  lat: number;
  lng: number;
  z: string;
  c: string;
  m: number;
  f: 0 | 1;
};
export type ZoneAnalysis = {
  ok: true;
  puntos: ZonePoint[];
  zonas: ZoneAggregate[];
  resumen: Counts & { fuera: number; sin_zip: number; sin_punto: number };
  zips_faltantes: { zip: number; ciudad: string }[];
  zips_guardados: number;
};

const counts = (): Counts => ({
  lead: 0,
  estimado: 0,
  activo: 0,
  terminado: 0,
});
const round = (n: number, digits: number) => {
  const scale = 10 ** digits;
  const scaled = Math.abs(n) * scale;
  // PHP's half-up rounding compensates representation error near a tie.
  return (
    (Math.sign(n) * Math.round(scaled + Number.EPSILON * scaled * 4)) / scale
  );
};
const text = (value: string) => value.trim();
// Preserve the original fallback, including its treatment of a five-digit
// street number as a ZIP. Changing that rule is a separate product decision.
export function adtPostalCode(value: string) {
  const s = text(value);
  return (
    s.match(/\b(\d{5})(?:-\d{4})?\b/)?.[1] ?? s.match(/^(\d{5})/)?.[1] ?? ""
  );
}
export function adtServiceArea(zip: string) {
  return /^(32|33|34)\d{3}$/.test(text(zip));
}
export function adtPointOffset(lat: number, lng: number, seed: number) {
  const s = Math.abs(Math.trunc(seed));
  return {
    lat: round(lat + (((s * 37) % 200) - 100) / 45000, 6),
    lng: round(lng + (((s * 73) % 200) - 100) / 45000, 6),
  };
}
const phoneKey = (phone: string) => {
  const digits = phone.replace(/[^0-9]/g, "");
  return digits.length >= 10 ? digits.slice(-10) : "";
};

export function analyzeAdtZones(source: ZoneSource): ZoneAnalysis {
  const centers = new Map(source.postalCenters.map((z) => [z.zip, z]));
  const states = new Map<string, ZoneCategory>();
  const receipts = new Map<string, number>();
  for (const invoice of source.invoices) {
    if (text(invoice.status).toUpperCase() === "VOID") continue;
    const paid = Number(invoice.paid_amount),
      balance = Number(invoice.balance_due);
    if (!Number.isFinite(paid) || !Number.isFinite(balance))
      throw new Error("Invalid zone source amount");
    const customer = invoice.client_external_id;
    receipts.set(customer, (receipts.get(customer) ?? 0) + paid);
    if (paid <= 0) continue;
    if (Math.abs(balance) > 0.009) states.set(customer, "activo");
    else if (states.get(customer) !== "activo")
      states.set(customer, "terminado");
  }
  const result: ZoneAnalysis = {
    ok: true,
    puntos: [],
    zonas: [],
    resumen: { ...counts(), fuera: 0, sin_zip: 0, sin_punto: 0 },
    zips_faltantes: [],
    zips_guardados: centers.size,
  };
  const zones = new Map<
    string,
    Counts & { zip: string; ciudad: string; ingresos: number }
  >();
  const seen = new Set<string>();
  function add(
    contact: ZoneContact,
    category: ZoneCategory,
    amount: number,
    seed: number,
  ) {
    const zip =
      adtPostalCode(contact.postal_code) || adtPostalCode(contact.address);
    const city = text(contact.city);
    result.resumen[category]++;
    if (!zip) result.resumen.sin_zip++;
    const inside = adtServiceArea(zip);
    if (!inside) result.resumen.fuera++;
    else {
      const row = zones.get(zip) ?? {
        zip,
        ciudad: city,
        ...counts(),
        ingresos: 0,
      };
      if (!row.ciudad && city) row.ciudad = city;
      row[category]++;
      row.ingresos += amount;
      zones.set(zip, row);
    }
    const center = centers.get(zip);
    if (!center) {
      result.resumen.sin_punto++;
      return;
    }
    result.puntos.push({
      t: category,
      n: contact.full_name.slice(0, 60),
      ...adtPointOffset(center.lat, center.lng, seed),
      z: zip,
      c: city.slice(0, 40),
      m: round(amount, 2),
      f: inside ? 0 : 1,
    });
  }
  source.customers.forEach((customer, index) => {
    const phone = phoneKey(customer.phone),
      email = text(customer.email).toLowerCase();
    if (phone) seen.add(phone);
    if (email) seen.add(email);
    add(
      customer,
      states.get(customer.external_id) ?? "estimado",
      receipts.get(customer.external_id) ?? 0,
      index + 7,
    );
  });
  const statuses = new Map(
    source.leadStatuses.map((m) => [m.lead_id, text(m.status).toUpperCase()]),
  );
  source.webformLeads.forEach((lead, index) => {
    if (lead.id && statuses.get(lead.id) === "FUERA_AREA") return;
    const phone = phoneKey(lead.phone),
      email = text(lead.email).toLowerCase();
    if ((phone && seen.has(phone)) || (email && seen.has(email))) return;
    add(lead, "lead", 0, index + 101);
  });
  result.zonas = [...zones.values()]
    .map((z) => {
      const contactos = z.lead + z.estimado + z.activo + z.terminado;
      const cerrados = z.activo + z.terminado;
      return {
        ...z,
        contactos,
        cerrados,
        cierre: contactos ? round((cerrados / contactos) * 100, 1) : 0,
        ingresos: round(z.ingresos, 2),
        ticket: cerrados ? round(z.ingresos / cerrados, 2) : 0,
      };
    })
    .sort((a, b) => b.ingresos - a.ingresos || b.contactos - a.contactos);
  result.zips_faltantes = [...zones.values()]
    .filter((z) => !centers.has(z.zip))
    // PHP converts the Florida ZIP array keys to integers in this list.
    .map(({ zip, ciudad }) => ({ zip: Number(zip), ciudad }));
  return result;
}

// ADT's layer toggles affect points, not the totals or CSV table.
export function visibleZonePoints(
  report: ZoneAnalysis,
  categories: ZoneCategory[],
  outside = false,
) {
  const enabled = new Set(categories);
  return report.puntos.filter(
    (point) => enabled.has(point.t) && (outside || point.f === 0),
  );
}
export function zonesCsv(report: ZoneAnalysis) {
  const escape = (value: string | number) => {
    let s = String(value);
    if (typeof value === "string" && /^[\s\u0000-\u001f]*[=+@-]/.test(s))
      s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const header = [
    "Codigo postal",
    "Ciudad",
    "Leads",
    "Estimados",
    "Activos",
    "Terminados",
    "Contactos",
    "Cerrados",
    "Cierre %",
    "Ingresos",
    "Ticket promedio",
  ];
  return [
    header,
    ...report.zonas.map((z) => [
      z.zip,
      z.ciudad,
      z.lead,
      z.estimado,
      z.activo,
      z.terminado,
      z.contactos,
      z.cerrados,
      z.cierre,
      z.ingresos,
      z.ticket,
    ]),
  ]
    .map((row) => row.map(escape).join(","))
    .join("\n");
}
