import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import { requireModule } from "@/lib/auth";
import { canAccess } from "@/lib/modules";
import { uuid } from "@/lib/validation";
import { emptyProduct, type Product } from "@/lib/commercial";
import { ProductForm } from "@/components/product-form";
import { ProductImage } from "@/components/product-image";
export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string; productId: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { companyId, productId } = await params,
    isNew = productId === "nuevo";
  const { db, member } = await requireModule(
    companyId,
    "productos",
    isNew ? "write" : "read",
  );
  let record: Product = { ...emptyProduct, id: randomUUID(), version: 0 };
  let imageUrl: string | null = null;
  if (!isNew) {
    if (!uuid.safeParse(productId).success) notFound();
    const { data, error } = await db
      .from("products")
      .select("*")
      .eq("company_id", companyId)
      .eq("id", productId)
      .maybeSingle();
    if (error) throw new Error("No se pudo cargar el producto.");
    if (!data) notFound();
    if (data.image_path) {
      const signed = await db.storage
        .from("product-images")
        .createSignedUrl(data.image_path, 300);
      if (signed.error) throw new Error("No se pudo cargar la imagen privada.");
      imageUrl = signed.data.signedUrl;
    }
    record = {
      ...data,
      unit_price: String(data.unit_price),
      options: data.options.map((g: Product["options"][number]) => ({
        ...g,
        choices: g.choices.map((c) => ({ ...c, add: String(c.add) })),
      })),
    };
  }
  return (
    <>
      <div className="mb-7">
        <p className="eyebrow">Comercial / Productos</p>
        <h1 className="page-title mt-2">
          {isNew ? "Nuevo producto" : record.name}
        </h1>
      </div>
      <ProductForm
        key={`${record.id}:${record.version}`}
        companyId={companyId}
        id={record.id}
        version={record.version}
        initial={record}
        readOnly={!canAccess(member, "productos", "write")}
        saved={(await searchParams).saved === "1"}
      />
      {!isNew && (
        <ProductImage
          key={`image:${record.version}`}
          companyId={companyId}
          id={record.id}
          version={record.version}
          url={imageUrl}
          readOnly={!canAccess(member, "productos", "write")}
        />
      )}
    </>
  );
}
