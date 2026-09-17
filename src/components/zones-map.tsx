type Zone = { id: string; name: string; data: Record<string, string> };
export function ZonesMap({ zones }: { zones: Zone[] }) {
  if (!zones.length) return null;
  const lats = zones.map((z) => Number(z.data.latitude)),
    midLat = lats.reduce((a, b) => a + b, 0) / lats.length,
    cos = Math.max(0.01, Math.cos((midLat * Math.PI) / 180));
  const points = zones.map((z) => ({
    ...z,
    x: Number(z.data.longitude) * 111320 * cos,
    y: -Number(z.data.latitude) * 111320,
    r: Number(z.data.radius_m),
  }));
  const minX = Math.min(...points.map((p) => p.x - p.r)),
    maxX = Math.max(...points.map((p) => p.x + p.r)),
    minY = Math.min(...points.map((p) => p.y - p.r)),
    maxY = Math.max(...points.map((p) => p.y + p.r)),
    scale = Math.min(
      680 / Math.max(100, maxX - minX),
      300 / Math.max(100, maxY - minY),
    );
  return (
    <figure className="card mb-5">
      <figcaption className="font-semibold mb-2">
        Zonas de esta página · vista esquemática
      </figcaption>
      <svg
        viewBox="0 0 800 400"
        role="img"
        aria-label="Ubicación relativa y radios de las zonas filtradas"
        className="w-full max-h-96 rounded bg-emerald-50"
      >
        <path d="M40 40V360H760" fill="none" stroke="#a7c5ba" />
        <text x="45" y="25" fontSize="12">
          N ↑
        </text>
        {points.map((p) => (
          <g key={p.id}>
            <circle
              cx={60 + (p.x - minX) * scale}
              cy={45 + (p.y - minY) * scale}
              r={Math.max(3, p.r * scale)}
              fill="#16634b"
              fillOpacity=".12"
              stroke="#16634b"
            />
            <circle
              cx={60 + (p.x - minX) * scale}
              cy={45 + (p.y - minY) * scale}
              r="3"
              fill="#16634b"
            />
            <text
              x={68 + (p.x - minX) * scale}
              y={40 + (p.y - minY) * scale}
              fontSize="11"
            >
              {p.name.slice(0, 30)}
            </text>
          </g>
        ))}
      </svg>
      <p className="text-xs text-muted-foreground mt-2">
        Proyección local aproximada, sin calles ni seguimiento en vivo. Consulta
        las coordenadas y el radio en cada ficha.
      </p>
    </figure>
  );
}
