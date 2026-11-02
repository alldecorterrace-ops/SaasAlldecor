import type { Variant } from "./inventory";

export type ProductAxis = { name: string; values: string[] };
export const maxAxes = 6;
export const maxCombinations = 200;

// Match the catalog's inventory_key when comparing user-entered labels.
export const catalogKey = (text: string) =>
  text.replace(/\s+/g, "").toLowerCase();

export function variantKey(options: Record<string, string>) {
  return JSON.stringify(
    Object.entries(options)
      .map(([name, value]) => [catalogKey(name), catalogKey(value)])
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
}

export function productAxes(variants: Variant[], layout: ProductAxis[] = []) {
  const axes = layout.map((axis) => ({
    name: axis.name,
    values: [...axis.values],
  }));
  for (const variant of variants) {
    for (const [name, value] of Object.entries(variant.options)) {
      let axis = axes.find((a) => catalogKey(a.name) === catalogKey(name));
      if (!axis) {
        axis = { name, values: [] };
        axes.push(axis);
      }
      if (!axis.values.some((v) => catalogKey(v) === catalogKey(value)))
        axis.values.push(value);
    }
  }
  return axes;
}

export function variantCombinations(axes: ProductAxis[]) {
  const count = axes.reduce((n, a) => n * a.values.length, 1);
  const names = axes.map((a) => catalogKey(a.name));
  const incomplete =
    names.some((n) => !n) || axes.some((a) => !a.values.length);
  const duplicate = new Set(names).size !== names.length;
  let combinations: Record<string, string>[] = [];
  if (
    !incomplete &&
    !duplicate &&
    count <= maxCombinations &&
    axes.length <= maxAxes
  ) {
    combinations = [{}];
    for (const axis of axes) {
      combinations = combinations.flatMap((previous) =>
        axis.values.map((value) => ({
          ...previous,
          [axis.name.trim()]: value,
        })),
      );
    }
  }
  return { combinations, count, incomplete, duplicate };
}
