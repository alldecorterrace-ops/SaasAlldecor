import Link from "next/link";
import { Button } from "./ui/button";
export function ListPagination({
  path,
  page,
  count,
  query,
}: {
  path: string;
  page: number;
  count: number;
  query: Record<string, string>;
}) {
  const href = (n: number) =>
    `${path}?${new URLSearchParams({ ...query, page: String(n) })}`;
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 mt-5 text-sm text-muted-foreground">
      <span>
        {count} registros · Página {page} de{" "}
        {Math.max(1, Math.ceil(count / 20))}
      </span>
      <div className="flex gap-3">
        {page > 1 && (
          <Button variant="outline" asChild>
            <Link href={href(page - 1)}>Anterior</Link>
          </Button>
        )}
        {page * 20 < count && (
          <Button variant="outline" asChild>
            <Link href={href(page + 1)}>Siguiente</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
