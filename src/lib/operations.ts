import { z } from "zod";
import { decimal } from "./commercial";
import { paymentMethods } from "./finance";
export const expenseStatuses = {
  PENDIENTE: "Pendiente",
  APROBADO: "Aprobado",
  RECHAZADO: "Rechazado",
  ANULADO: "Anulado",
} as const;
export const reimbursements = {
  NO_APLICA: "No aplica",
  PENDIENTE: "Pendiente de reembolso",
  REEMBOLSADO: "Reembolsado",
} as const;
export const workerSchema = z.object({
  name: z.string().trim().min(2).max(190),
  email: z.union([z.email(), z.literal("")]),
  phone: z.string().max(64),
  job_title: z.string().max(128),
  team: z.string().max(128),
  hourly_rate: decimal,
  weekly_target: z.coerce.number().int().min(0).max(168),
  active: z.boolean(),
  notes: z.string().max(10000),
});
export const expenseSchema = z
  .object({
    project_id: z.uuid().nullable(),
    worker_id: z.uuid().nullable(),
    expense_date: z.iso.date(),
    category: z.string().trim().min(1).max(64),
    description: z.string().max(2000),
    vendor: z.string().max(190),
    document_number: z.string().max(100),
    amount: decimal.refine((x) => Number(x) > 0),
    method: z.enum(
      Object.keys(paymentMethods) as [
        keyof typeof paymentMethods,
        ...(keyof typeof paymentMethods)[],
      ],
    ),
    reimbursement_status: z.enum(["NO_APLICA", "PENDIENTE", "REEMBOLSADO"]),
    status: z.enum(["PENDIENTE", "APROBADO", "RECHAZADO", "ANULADO"]),
    decision_note: z.string().max(2000),
  })
  .refine(
    (x) => x.reimbursement_status === "NO_APLICA" || !!x.worker_id,
    "Selecciona el trabajador para registrar un reembolso.",
  );
export type RecordField = {
  name: string;
  label: string;
  type?:
    | "text"
    | "date"
    | "datetime-local"
    | "email"
    | "textarea"
    | "number"
    | "decimal"
    | "select"
    | "checkbox";
  required?: boolean;
  maxLength?: number;
  min?: number;
  max?: number;
  options?: Record<string, string>;
  managerOnly?: boolean;
};
export const workerFields: RecordField[] = [
  { name: "name", label: "Nombre", required: true, maxLength: 190 },
  { name: "email", label: "Correo", type: "email", maxLength: 254 },
  { name: "phone", label: "Teléfono", maxLength: 64 },
  { name: "job_title", label: "Puesto", maxLength: 128 },
  { name: "team", label: "Equipo", maxLength: 128 },
  {
    name: "hourly_rate",
    label: "Tarifa por hora (USD)",
    type: "decimal",
    required: true,
  },
  {
    name: "weekly_target",
    label: "Meta semanal (horas)",
    type: "number",
    min: 0,
    max: 168,
    required: true,
  },
  { name: "active", label: "Trabajador activo", type: "checkbox" },
  { name: "notes", label: "Notas", type: "textarea", maxLength: 10000 },
];
export const expenseFields: RecordField[] = [
  {
    name: "expense_date",
    label: "Fecha del gasto",
    type: "date",
    required: true,
  },
  { name: "category", label: "Categoría", required: true, maxLength: 64 },
  { name: "amount", label: "Importe (USD)", type: "decimal", required: true },
  { name: "vendor", label: "Comercio o proveedor", maxLength: 190 },
  {
    name: "document_number",
    label: "Número de recibo o factura",
    maxLength: 100,
  },
  {
    name: "method",
    label: "Método de pago",
    type: "select",
    options: paymentMethods,
  },
  {
    name: "description",
    label: "Descripción",
    type: "textarea",
    maxLength: 2000,
  },
  {
    name: "reimbursement_status",
    label: "Reembolso",
    type: "select",
    options: reimbursements,
    managerOnly: true,
  },
  {
    name: "status",
    label: "Estado de revisión",
    type: "select",
    options: expenseStatuses,
    managerOnly: true,
  },
  {
    name: "decision_note",
    label: "Motivo o nota de revisión",
    type: "textarea",
    maxLength: 2000,
    managerOnly: true,
  },
];
