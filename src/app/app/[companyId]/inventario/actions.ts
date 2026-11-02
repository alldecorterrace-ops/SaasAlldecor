"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { companyContext } from "@/lib/auth";
import { uuid } from "@/lib/validation";
import { invError, inventorySections } from "@/lib/inventory";
export type InvState = { error?: string };
export async function inventoryMutation(
  companyId: string,
  operation: string,
  slug: string,
  previous: InvState,
  form: FormData,
): Promise<InvState> {
  const { db } = await companyContext(companyId);
  const section = inventorySections.find((s) => s.slug === slug);
  if (!section) return { error: "Sección no disponible." };
  const get = (name: string) => String(form.get(name) ?? "").trim();
  const req = get("request");
  if (!uuid.safeParse(req).success)
    return { error: "Abre el formulario de nuevo." };
  const target = get("id") || null,
    version = Number(get("version") || "0");
  let fields: Record<string, unknown> = {};
  try {
    if (form.has("data")) fields = JSON.parse(get("data"));
  } catch {
    return { error: "Revisa los datos del formulario." };
  }
  let proc: string,
    args: Record<string, unknown>,
    detail = target;
  const common = { p_company: companyId, p_request: req };
  switch (operation) {
    case "master":
      proc = "inventory_save_master";
      args = {
        ...common,
        p_id: target,
        p_version: version,
        p_kind: section.kind,
        p_data: Object.fromEntries(
          [
            "name",
            "kind",
            "city",
            "address",
            "tax_identifier",
            "phone",
            "email",
            "notes",
          ].map((x) => [x, get(x)]),
        ),
      };
      args.p_data = {
        ...(args.p_data as object),
        active: form.has("active"),
        remove: form.has("remove"),
      };
      break;
    case "family":
      proc = "inventory_save_family";
      args = { ...common, p_id: target, p_version: version, p_data: fields };
      break;
    case "post":
      proc = "inventory_post_document";
      args = { ...common, p_data: { ...fields, kind: section.kind } };
      break;
    case "void":
      proc = "inventory_void_document";
      args = { ...common, p_document: target, p_reason: get("reason") };
      break;
    case "cost":
      proc = "inventory_value_lot";
      args = {
        ...common,
        p_lot: get("lot"),
        p_variant: get("variant"),
        p_cost: get("cost") || null,
        p_reason: get("reason") || null,
      };
      break;
    case "price":
      proc = "inventory_set_price";
      args = {
        ...common,
        p_variant: get("variant"),
        p_price: get("price") || null,
      };
      break;
    case "option":
      proc = "inventory_save_master";
      args = {
        ...common,
        p_kind: "OPTION",
        p_id: get("option"),
        p_version: 1,
        p_data: { active: get("enabled") === "true" },
      };
      break;
    case "access":
      proc = "set_inventory_location_access";
      args = {
        p_company: companyId,
        p_user: get("user"),
        p_location: target,
        p_actions: form.has("assigned")
          ? form.getAll("actions").map(String)
          : null,
      };
      break;
    case "opening":
      proc = "inventory_activate";
      args = { ...common, p_date: get("date"), p_stamp: get("stamp") };
      detail = null;
      break;
    case "minimum":
      proc = "inventory_set_minimum";
      args = {
        ...common,
        p_location: get("location"),
        p_kind: slug === "productos" ? "FAMILY" : "VARIANT",
        p_target: target,
        p_min: get("minimum"),
      };
      break;
    case "charge":
      proc = "inventory_add_purchase_charge";
      args = {
        ...common,
        p_document: target,
        p_kind: get("kind"),
        p_amount: get("amount"),
        p_note: get("note"),
        p_stamp: get("stamp"),
      };
      break;
    case "mapping":
      proc = "map_inventory_opening_item";
      args = {
        p_company: companyId,
        p_item: get("item"),
        p_variant: get("variant"),
        p_location: get("location"),
      };
      break;
    default:
      return { error: "Operación no disponible." };
  }
  const { data, error } = await db.rpc(proc, args);
  if (error) return { error: invError(error) };
  if (operation === "post" || operation === "family" || operation === "master")
    detail = typeof data === "string" ? data : null;
  if (operation === "master" && form.has("remove")) detail = null;
  revalidatePath(`/app/${companyId}`, "layout");
  if (operation === "mapping")
    redirect(`/app/${companyId}/inventario/revision-inicial?estado=pendiente`);
  redirect(
    `/app/${companyId}/inventario/${slug}` +
      (detail && uuid.safeParse(detail).success ? "/" + detail : ""),
  );
}
