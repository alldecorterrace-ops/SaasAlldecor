import path from "node:path";

export type ReleaseInventory = {
  name: string;
  realPath: string;
  commit: string;
  published: boolean;
  sourceVerified: boolean;
  uniqueData: boolean;
  bytes: number;
  entries: number;
  dependencies: string[];
};

export type RetentionInventory = {
  root: string;
  active: string;
  rollback: string;
  rollbackVerified: boolean;
  processRoots: string[];
  releases: ReleaseInventory[];
};

// This is a proposal, never a deletion operation. Unverified releases stay on disk.
export function planReleaseRetention(input: RetentionInventory) {
  const root = path.posix.normalize(input.root);
  if (!root.startsWith("/") || root === "/" || root !== input.root)
    throw new Error("La raíz debe ser absoluta y normalizada");
  if (!input.rollbackVerified || input.active === input.rollback)
    throw new Error("Se requiere un retorno distinto y validado");
  const releases = new Map<string, ReleaseInventory>();
  for (const release of input.releases) {
    if (
      !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(release.name) ||
      release.realPath !== `${root}/${release.name}` ||
      releases.has(release.name) ||
      !Number.isSafeInteger(release.bytes) ||
      release.bytes < 0 ||
      !Number.isSafeInteger(release.entries) ||
      release.entries < 0
    )
      throw new Error("Inventario de entregas inválido");
    releases.set(release.name, release);
  }
  const preserved = new Map<string, string[]>();
  function preserve(name: string, reason: string) {
    const release = releases.get(name);
    if (!release) throw new Error("Referencia a una entrega no inventariada");
    const reasons = preserved.get(name);
    if (reasons) {
      if (!reasons.includes(reason)) reasons.push(reason);
      return;
    }
    preserved.set(name, [reason]);
    for (const dependency of release.dependencies) {
      if (!releases.has(dependency))
        throw new Error("Dependencia fuera del inventario: detener limpieza");
      preserve(dependency, `Dependencia de ${name}`);
    }
  }
  // Reject even unused unknown dependencies: they can indicate an incomplete scan.
  for (const release of input.releases)
    for (const dependency of release.dependencies)
      if (!releases.has(dependency))
        throw new Error("Dependencia no inventariada");
  preserve(input.active, "Aplicación activa");
  preserve(input.rollback, "Retorno validado");
  for (const processRoot of input.processRoots) {
    const owner = input.releases.find(
      (r) =>
        processRoot === r.realPath || processRoot.startsWith(r.realPath + "/"),
    );
    if (!owner) throw new Error("Proceso del SaaS fuera del inventario");
    preserve(owner.name, "Proceso en ejecución");
  }
  const candidates: ReleaseInventory[] = [];
  const review: { name: string; reason: string }[] = [];
  for (const release of input.releases) {
    if (preserved.has(release.name)) continue;
    if (
      !/^[a-f0-9]{40}$/.test(release.commit) ||
      !release.published ||
      !release.sourceVerified ||
      release.uniqueData
    )
      review.push({
        name: release.name,
        reason: "Falta comprobar publicación, contenido o datos únicos",
      });
    else candidates.push(release);
  }
  // A retained release may need another otherwise-removable release.
  for (const item of review) preserve(item.name, "Conservar hasta revisión");
  const removable = candidates.filter((r) => !preserved.has(r.name));
  const reclaimableBytes = removable.reduce((total, r) => total + r.bytes, 0);
  const reclaimableEntries = removable.reduce(
    (total, r) => total + r.entries,
    0,
  );
  if (
    !Number.isSafeInteger(reclaimableBytes) ||
    !Number.isSafeInteger(reclaimableEntries)
  )
    throw new Error("El total del inventario excede el rango seguro");
  return {
    preserved: [...preserved].map(([name, reasons]) => ({ name, reasons })),
    review,
    candidates: removable.map((r) => r.name),
    reclaimableBytes,
    reclaimableEntries,
    requiresFreshInventoryBeforeDeletion: true,
  };
}
