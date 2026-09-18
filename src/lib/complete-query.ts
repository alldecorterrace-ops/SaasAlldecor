// Never silently audit only the first API page. The bound makes unexpected
// growth explicit instead of returning an incomplete reconciliation.
export async function completeQuery<T>(
  read: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown; count: number | null }>,
) {
  const result: T[] = [];
  let expected: number | undefined;
  for (let from = 0; from <= 10000;) {
    const { data, error, count } = await read(from, from + 499);
    if (
      error ||
      !data ||
      count === null ||
      (expected !== undefined && expected !== count)
    )
      throw new Error("No se pudo cargar la conciliación completa.");
    expected = count;
    if (count > 10000 || result.length + data.length > 10000)
      throw new Error(
        "La conciliación supera el límite de consulta. Requiere una revisión por lotes.",
      );
    result.push(...data);
    if (result.length === count) return result;
    if (!data.length || result.length > count)
      throw new Error(
        "No se pudo comprobar que la conciliación esté completa.",
      );
    from += data.length;
  }
  throw new Error("No se pudo comprobar que la conciliación esté completa.");
}
