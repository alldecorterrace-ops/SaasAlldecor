"use server";
import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/auth";
import { uuid } from "@/lib/validation";
import {
  verifyExpenseReceipt,
  singleReceiptError,
} from "@/lib/expense-single-receipts";
import type { OperationState } from "../operaciones/actions";
export async function setExpenseReceipt(
  companyId: string,
  id: string,
  version: number,
  _: OperationState,
  form: FormData,
): Promise<OperationState> {
  const { db } = await requireModule(companyId, "gastos", "write");
  const request = form.get("request_id"),
    receipt = form.get("receipt_id"),
    remove = form.get("remove") === "true";
  if (
    !uuid.safeParse(id).success ||
    !Number.isSafeInteger(version) ||
    version < 1 ||
    !uuid.safeParse(request).success ||
    (!remove && !uuid.safeParse(receipt).success) ||
    (remove && receipt)
  )
    return { error: "Selecciona un recibo o indica que deseas quitarlo." };
  try {
    if (!remove)
      await verifyExpenseReceipt(db, companyId, id, version, String(receipt));
    const { error } = await db.rpc("set_prepared_expense_receipt", {
      p_company: companyId,
      p_expense: id,
      p_version: version,
      p_request: String(request),
      p_receipt: remove ? null : String(receipt),
    });
    if (error) throw error;
    revalidatePath(`/app/${companyId}`, "layout");
    return {
      success: "Recibo guardado. Los archivos anteriores se conservan.",
    };
  } catch (error) {
    return { error: singleReceiptError(error) };
  }
}
