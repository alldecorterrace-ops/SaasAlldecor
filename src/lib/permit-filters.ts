import { z } from "zod";

export function permitDateError(from: string, to: string): string | null {
  if ([from, to].some((date) => date && !z.iso.date().safeParse(date).success))
    return "Revisa las fechas del filtro.";
  if (from && to && from > to)
    return "La fecha desde no puede ser posterior a la fecha hasta.";
  return null;
}
