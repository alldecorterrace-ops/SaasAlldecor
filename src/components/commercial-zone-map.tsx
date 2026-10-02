"use client";
import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import {
  zoneCategories,
  visibleZonePoints,
  type ZoneAnalysis,
  type ZoneCategory,
} from "@/lib/zone-analysis";
import { usd } from "@/lib/finance";
import {
  cartographyTileUrl,
  type CartographyProvider,
} from "@/lib/cartography";
import {
  monitorCartography,
  type CartographyStatus,
} from "@/lib/cartography-status";
import "../../public/vendor/leaflet-1.9.4/leaflet.css";

type MapView = {
  setView: (point: number[], zoom: number) => MapView;
  remove: () => void;
  invalidateSize: () => void;
};
type Layer = {
  addTo: (map: MapView) => Layer;
  clearLayers: () => void;
  addLayer: (layer: Marker) => void;
  remove: () => void;
};
type Marker = { bindPopup: (content: HTMLElement) => Marker };
type TileLayer = {
  addTo: (map: MapView) => TileLayer;
  on: (events: Record<string, () => void>) => TileLayer;
  off: (events: Record<string, () => void>) => TileLayer;
  redraw: () => TileLayer;
};
type Leaflet = {
  map: (element: HTMLElement, options: object) => MapView;
  tileLayer: (url: string, options: object) => TileLayer;
  layerGroup: () => Layer;
  circleMarker: (point: number[], options: object) => Marker;
};
declare global {
  interface Window {
    L?: Leaflet;
  }
}
const colors: Record<ZoneCategory, string> = {
  terminado: "#1F6FB2",
  activo: "#C0392B",
  estimado: "#E67E22",
  lead: "#E8C13B",
};
const labels: Record<ZoneCategory, string> = {
  terminado: "Terminados",
  activo: "Activos",
  estimado: "Estimados",
  lead: "Leads",
};
const all = Object.keys(zoneCategories) as ZoneCategory[];

export function CommercialZoneMap({
  report,
  provider,
}: {
  report: ZoneAnalysis;
  provider: CartographyProvider;
}) {
  const element = useRef<HTMLDivElement>(null),
    map = useRef<MapView | null>(null),
    layer = useRef<Layer | null>(null),
    retry = useRef<(() => void) | null>(null);
  const [ready, setReady] = useState(false),
    [failed, setFailed] = useState(false);
  const [tileStatus, setTileStatus] = useState<CartographyStatus>("loading");
  const [categories, setCategories] = useState<ZoneCategory[]>(all),
    [outside, setOutside] = useState(false);
  const points = visibleZonePoints(report, categories, outside);
  useEffect(() => {
    const L = window.L;
    if (!ready || !L || !element.current) return;
    const view = L.map(element.current, { scrollWheelZoom: false }).setView(
      [25.85, -80.35],
      9,
    );
    map.current = view;
    const monitor = monitorCartography(setTileStatus, {
      schedule: (action, delay) => window.setTimeout(action, delay),
      cancel: (timer) => window.clearTimeout(timer as number),
    });
    const events = {
      loading: monitor.loading,
      tileerror: monitor.tileerror,
      load: monitor.load,
    };
    const url = cartographyTileUrl(provider);
    let tiles: TileLayer | null = null;
    if (url) {
      tiles = L.tileLayer(url, {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        // The browser sends its normal User-Agent, origin Referer and HTTP cache.
        referrerPolicy: "strict-origin-when-cross-origin",
      })
        .on(events)
        .addTo(view);
      retry.current = () => {
        monitor.loading();
        tiles?.redraw();
      };
    }
    layer.current = L.layerGroup().addTo(view);
    const observer = new ResizeObserver(() => view.invalidateSize());
    observer.observe(element.current);
    return () => {
      observer.disconnect();
      monitor.stop();
      tiles?.off(events);
      retry.current = null;
      layer.current?.remove();
      layer.current = null;
      view.remove();
      map.current = null;
    };
  }, [ready, provider]);
  useEffect(() => {
    const L = window.L,
      group = layer.current;
    if (!ready || !L || !group) return;
    group.clearLayers();
    for (const p of visibleZonePoints(report, categories, outside)) {
      const content = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = p.n || "Sin nombre";
      content.append(title);
      for (const value of [
        zoneCategories[p.t],
        `${p.c} ${p.z}`,
        ...(p.m > 0 ? [`Facturado: ${usd(p.m)}`] : []),
      ]) {
        const line = document.createElement("div");
        line.textContent = value;
        content.append(line);
      }
      group.addLayer(
        L.circleMarker([p.lat, p.lng], {
          radius: p.t === "lead" ? 4.5 : p.t === "estimado" ? 6 : 7,
          color: "#fff",
          weight: 1.5,
          opacity: 0.9,
          fillColor: colors[p.t],
          fillOpacity: p.f ? 0.35 : 0.85,
        }).bindPopup(content),
      );
    }
  }, [ready, provider, report, categories, outside]);
  return (
    <section className="space-y-4 min-w-0">
      <Script
        src="/vendor/leaflet-1.9.4/leaflet.js"
        onReady={() => setReady(true)}
        onError={() => setFailed(true)}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {all.map((key) => (
          <div
            className="card"
            key={key}
            style={{ borderLeft: `4px solid ${colors[key]}` }}
          >
            <p className="text-sm">{labels[key]}</p>
            <p className="text-2xl font-semibold">{report.resumen[key]}</p>
          </div>
        ))}
        <div className="card">
          <p className="text-sm">Fuera del área</p>
          <p className="text-2xl font-semibold">{report.resumen.fuera}</p>
          <p className="text-xs">No cuentan en la tabla</p>
        </div>
      </div>
      <div className="card flex flex-wrap items-center gap-3">
        {all.map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={categories.includes(key)}
            className="rounded-full border px-3 py-2 text-sm"
            style={{
              borderColor: colors[key],
              opacity: categories.includes(key) ? 1 : 0.5,
            }}
            onClick={() =>
              setCategories((current) =>
                current.includes(key)
                  ? current.filter((k) => k !== key)
                  : [...current, key],
              )
            }
          >
            {labels[key]}
          </button>
        ))}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={outside}
            onChange={(e) => setOutside(e.target.checked)}
          />
          Ver los de fuera del área
        </label>
        <p className="w-full text-sm" aria-live="polite">
          Puntos visibles: {points.length}
        </p>
      </div>
      {failed && (
        <p role="alert">
          No se pudo cargar el mapa. Puedes consultar la tabla y volver a cargar
          la página.
        </p>
      )}
      {!failed && provider !== "disabled" && (
        <div aria-live="polite" className="space-y-2 text-sm">
          {tileStatus === "loading" && <p role="status">Cargando calles…</p>}
          {tileStatus === "ready" && <p role="status">Calles cargadas.</p>}
          {tileStatus === "unavailable" && (
            <>
              <p role="alert">
                No se pudieron cargar todas las calles. Los puntos, la lista y
                la exportación siguen disponibles.
              </p>
              <button
                type="button"
                className="underline"
                onClick={() => retry.current?.()}
              >
                Reintentar calles
              </button>
            </>
          )}
        </div>
      )}
      <div
        ref={element}
        role="region"
        aria-label="Mapa comercial por código postal"
        className="relative z-0 isolate h-96 w-full rounded-xl border bg-slate-100 sm:h-[460px]"
      />
      {provider === "disabled" && (
        <p className="text-sm text-muted-foreground">
          Entorno de pruebas: las calles externas están desactivadas. Los puntos
          usan las ubicaciones de prueba guardadas.
        </p>
      )}
      <details className="card">
        <summary>Puntos del mapa en formato de lista ({points.length})</summary>
        <ul className="mt-3 space-y-2">
          {points.map((p, i) => (
            <li key={`${p.t}-${i}`} className="break-words">
              {p.n} · {zoneCategories[p.t]} · {p.c} {p.z}
              {p.m > 0 ? ` · Facturado: ${usd(p.m)}` : ""}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
