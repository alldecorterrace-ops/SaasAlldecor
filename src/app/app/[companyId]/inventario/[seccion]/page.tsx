import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ListPagination } from "@/components/list-pagination";
import { MasterCard, DocCard, StockCard } from "@/components/inventory/cards";
import { SupplierFilter } from "@/components/inventory/lookup";
import { inventorySection } from "@/lib/inventory-server";
import {
  inventoryReasons,
  quantity,
  usd,
  type InvDoc,
  type Master,
  type StockGroup,
  type Choices,
} from "@/lib/inventory";
import { uuid } from "@/lib/validation";
type Search = Record<string, string | undefined>;
export default async function InventoryList({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string; seccion: string }>;
  searchParams: Promise<Search>;
}) {
  const { companyId, seccion } = await params,
    {
      db,
      inventory: ctx,
      section,
    } = await inventorySection(companyId, seccion),
    search = await searchParams;
  const root = `/app/${companyId}/inventario`,
    path = root + "/" + seccion;
  const clean = (k: string) => (search[k] ?? "").trim().slice(0, 150),
    uid = (k: string) => (uuid.safeParse(clean(k)).success ? clean(k) : null);
  const date = (k: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(clean(k)) ? clean(k) : null;
  const common = { p_company: companyId, p_query: clean("q") },
    where = uid("sede"),
    empty = search.vacias === "1",
    page = Math.max(1, Math.min(100000, parseInt(search.page ?? "1") || 1));
  const isDoc = ["COMPRA", "TRASLADO", "AJUSTE"].includes(section.kind),
    stock = section.kind === "STOCK",
    supplier = uid("proveedor");
  const canCreate =
    ctx.writable &&
    (isDoc
      ? ctx.active &&
        ctx.locations.some(
          (l) =>
            l.active &&
            l.actions.includes(
              section.kind === "COMPRA"
                ? "purchases.create"
                : section.kind === "TRASLADO"
                  ? "transfers.create"
                  : "adjustments.create",
            ),
        )
      : section.kind === "FAMILY"
        ? ctx.productCreate
        : section.kind === "SUPPLIER"
          ? ctx.supplierManage
          : section.kind === "LOCATION" && ctx.manager);
  const query = isDoc
    ? db
        .rpc(
          "inventory_document_rows",
          {
            ...common,
            p_kind: section.kind,
            p_from: date("desde"),
            p_to: date("hasta"),
            p_location: where,
            p_supplier: ctx.supplierView ? supplier : null,
            p_state: clean("estado") || null,
            p_pending: ctx.costView && search.pendiente === "1",
            p_reason: clean("motivo") || null,
          },
          { count: "exact" },
        )
        .order("business_date", { ascending: false })
        .order("id")
    : stock
      ? db
          .rpc(
            "inventory_stock_rows",
            { ...common, p_location: where, p_empty: empty },
            { count: "exact" },
          )
          .order("name")
          .order("id")
      : db
          .rpc(
            "inventory_master_rows",
            { ...common, p_kind: section.kind, p_category: uid("categoria") },
            { count: "exact" },
          )
          .order("name")
          .order("id");
  const badDates =
    (clean("desde") && !date("desde")) ||
    (clean("hasta") && !date("hasta")) ||
    (date("desde") && date("hasta") && date("desde")! > date("hasta")!);
  const [records, categories, total, supplierOptions] = await Promise.all([
    badDates
      ? { data: [], count: 0, error: null }
      : query.range((page - 1) * 20, page * 20 - 1),
    section.kind === "FAMILY"
      ? db.rpc("inventory_catalog_choices", { p_company: companyId })
      : { data: null, error: null },
    stock && ctx.costView
      ? db.rpc("inventory_stock_total", {
          ...common,
          p_location: where,
          p_empty: empty,
        })
      : { data: null, error: null },
    section.kind === "COMPRA" && ctx.supplierView && supplier
      ? db
          .rpc("inventory_master_rows", {
            p_company: companyId,
            p_kind: "SUPPLIER",
            p_id: supplier,
          })
          .select("id,name")
          .limit(1)
      : { data: [], error: null },
  ]);
  if (records.error || categories.error || total.error || supplierOptions.error)
    throw new Error("No se pudo cargar esta consulta de inventario.");
  const rows = records.data ?? [],
    paramsForPage = Object.fromEntries(
      Object.entries(search).filter(([k, v]) => k !== "page" && !!v),
    ) as Record<string, string>;
  const pdfParams = new URLSearchParams({
    q: clean("q"),
    ...(where ? { sede: where } : {}),
    ...(empty ? { vacias: "1" } : {}),
  });
  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">{section.group}</p>
          <h1 className="page-title mt-2">{section.label}</h1>
        </div>
        <div className="flex flex-wrap gap-3">
          {canCreate && (
            <Button asChild>
              <Link href={path + "/nuevo"}>
                {
                  (
                    {
                      compras: "Nueva compra",
                      productos: "Nuevo producto",
                      proveedores: "Nuevo proveedor",
                      movimientos: "Nuevo traslado",
                      ubicaciones: "Nueva ubicación",
                      ajustes: "Nuevo ajuste",
                    } as Record<string, string>
                  )[seccion]
                }
              </Link>
            </Button>
          )}
          {stock && (
            <Button variant="outline" asChild>
              <a href={root + "/conteo?" + pdfParams}>
                Descargar PDF de conteo
              </a>
            </Button>
          )}
        </div>
      </header>
      {stock && (
        <nav className="flex flex-wrap gap-4 text-sm">
          <Link className="underline" href={root + "/minimos"}>
            Existencias bajas
          </Link>
          {ctx.costView && (
            <Link className="underline" href={root + "/informes"}>
              Informes de costos
            </Link>
          )}
        </nav>
      )}
      {!ctx.active && (isDoc || stock) && (
        <div className="card">
          <p>La empresa está preparando sus existencias iniciales.</p>
          {ctx.manager && (
            <Link
              className="text-primary underline"
              href={root + "/revision-inicial"}
            >
              Revisar y confirmar la apertura
            </Link>
          )}
        </div>
      )}
      <form className="card flex flex-wrap gap-3 items-end">
        <label className="field grow">
          Buscar
          <Input
            name="q"
            defaultValue={clean("q")}
            placeholder={
              isDoc || stock || section.kind === "FAMILY"
                ? "Nombre, código o código de barras"
                : "Nombre"
            }
          />
        </label>
        {(isDoc || stock) && (
          <label className="field">
            Ubicación
            <select name="sede" defaultValue={where ?? ""}>
              <option value="">Todas mis ubicaciones</option>
              {ctx.locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {isDoc && (
          <>
            <label className="field">
              Desde
              <Input name="desde" type="date" defaultValue={clean("desde")} />
            </label>
            <label className="field">
              Hasta
              <Input name="hasta" type="date" defaultValue={clean("hasta")} />
            </label>
            {section.kind !== "AJUSTE" && (
              <label className="field">
                Estado
                <select name="estado" defaultValue={clean("estado")}>
                  <option value="">Todos</option>
                  <option value="REGISTRADO">Registrado</option>
                  <option value="ANULADO">Anulado</option>
                </select>
              </label>
            )}
          </>
        )}
        {section.kind === "COMPRA" && ctx.supplierView && (
          <SupplierFilter
            key={supplier ?? "todos"}
            company={companyId}
            initial={
              Array.isArray(supplierOptions.data)
                ? supplierOptions.data[0]
                : undefined
            }
          />
        )}
        {section.kind === "COMPRA" && ctx.costView && (
          <label>
            <input
              type="checkbox"
              name="pendiente"
              value="1"
              defaultChecked={search.pendiente === "1"}
            />{" "}
            Con costo pendiente
          </label>
        )}
        {section.kind === "AJUSTE" && (
          <label className="field">
            Motivo
            <select name="motivo" defaultValue={clean("motivo")}>
              <option value="">Todos</option>
              {Object.entries(inventoryReasons).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        )}
        {stock && (
          <label>
            <input
              type="checkbox"
              name="vacias"
              value="1"
              defaultChecked={empty}
            />{" "}
            Incluir vacías
          </label>
        )}
        {section.kind === "FAMILY" && (
          <label className="field">
            Categoría
            <select name="categoria" defaultValue={uid("categoria") ?? ""}>
              <option value="">Todas</option>
              {(categories.data as Choices)?.categories.map((c) => (
                <option value={c.id} key={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <Button>Filtrar</Button>
        <Link href={path} className="text-sm underline">
          Limpiar
        </Link>
      </form>
      {badDates && <p role="alert">Revisa el intervalo de fechas.</p>}
      {total.data && (
        <p className="card">
          Valor conocido del inventario <strong>{usd(total.data.value)}</strong>{" "}
          ·{" "}
          {total.data.pending > 0
            ? "Pendiente de costear: " +
              Object.entries(total.data.pendingUnits as Record<string, number>)
                .map(([unit, q]) => quantity(q) + " " + unit.toLowerCase())
                .join(" · ")
            : "Todo el saldo tiene costo"}
        </p>
      )}
      {rows.length === 0 && (
        <p className="card">No hay registros con estos filtros.</p>
      )}
      {isDoc
        ? (rows as InvDoc[]).map((r) => (
            <DocCard key={r.id} doc={r} path={path} />
          ))
        : stock
          ? (rows as StockGroup[]).map((r) => (
              <StockCard key={r.id} row={r} path={path} />
            ))
          : (rows as Master[]).map((r) => (
              <MasterCard key={r.id} row={r} path={path} slug={seccion} />
            ))}
      <ListPagination
        path={path}
        page={page}
        count={records.count ?? 0}
        query={paramsForPage}
      />
    </div>
  );
}
