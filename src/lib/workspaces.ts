import { z } from "zod";
import { decimal } from "./commercial";
import type { RecordField } from "./operations";
const text = (max: number) => z.string().trim().max(max);
const date = z.union([z.iso.date(), z.literal("")]);
const quantity = z
  .string()
  .regex(/^\d{1,9}(\.\d{1,3})?$/, "Usa hasta tres decimales.");
export const workKinds = [
  "permits",
  "inventory",
  "installations",
  "manuals",
  "zones",
] as const;
export type WorkKind = (typeof workKinds)[number];
type Workspace = {
  module: string;
  title: string;
  singular: string;
  description: string;
  statuses: Record<string, string>;
  fields: RecordField[];
  defaults: Record<string, string>;
  project?: boolean;
  worker?: boolean;
  schema: z.ZodType;
};
const notes: RecordField = {
  name: "notes",
  label: "Notas / motivo",
  type: "textarea",
  maxLength: 10000,
};
export const workspaces: Record<WorkKind, Workspace> = {
  permits: {
    module: "permisos",
    title: "Permisos de obra",
    singular: "permiso",
    description: "Trámites, fechas, autoridad y documentos de cada proyecto.",
    project: true,
    statuses: {
      PENDIENTE: "Pendiente",
      EN_REVISION: "En revisión",
      APROBADO: "Aprobado",
      RECHAZADO: "Rechazado",
      VENCIDO: "Vencido",
      ANULADO: "Anulado",
    },
    defaults: {
      fee: "0.00",
      authority: "",
      permit_number: "",
      submitted_date: "",
      approved_date: "",
      expiration_date: "",
      notes: "",
    },
    fields: [
      { name: "authority", label: "Autoridad / ciudad", maxLength: 190 },
      { name: "permit_number", label: "Número de permiso", maxLength: 100 },
      { name: "fee", label: "Tasa (USD)", type: "decimal", required: true },
      { name: "submitted_date", label: "Presentado", type: "date" },
      { name: "approved_date", label: "Aprobado", type: "date" },
      { name: "expiration_date", label: "Vencimiento", type: "date" },
      notes,
    ],
    schema: z.object({
      authority: text(190),
      permit_number: text(100),
      fee: decimal,
      submitted_date: date,
      approved_date: date,
      expiration_date: date,
      notes: text(10000),
    }),
  },
  inventory: {
    module: "inventario",
    title: "Inventario",
    singular: "artículo",
    description:
      "Existencias por artículo y ubicación. Entradas, salidas y reversos conservan su historial.",
    statuses: { ACTIVO: "Activo", ARCHIVADO: "Archivado" },
    defaults: {
      sku: "",
      unit: "unidad",
      minimum: "0",
      unit_cost: "0.00",
      location: "",
      notes: "",
    },
    fields: [
      { name: "sku", label: "SKU / código", maxLength: 100 },
      {
        name: "unit",
        label: "Unidad de medida",
        required: true,
        maxLength: 32,
      },
      { name: "location", label: "Ubicación / almacén", maxLength: 190 },
      { name: "minimum", label: "Existencia mínima", required: true },
      {
        name: "unit_cost",
        label: "Costo unitario de referencia (USD)",
        type: "decimal",
        required: true,
      },
      notes,
    ],
    schema: z.object({
      sku: text(100),
      unit: text(32).min(1),
      location: text(190),
      minimum: quantity,
      unit_cost: decimal,
      notes: text(10000),
    }),
  },
  installations: {
    module: "instalaciones",
    title: "Instalaciones",
    singular: "instalación",
    description:
      "Agenda por proyecto y responsable. Se rechazan horarios superpuestos del mismo responsable.",
    project: true,
    worker: true,
    statuses: {
      PROGRAMADA: "Programada",
      EN_CURSO: "En curso",
      COMPLETADA: "Completada",
      CANCELADA: "Cancelada",
    },
    defaults: { starts_at: "", ends_at: "", address: "", crew: "", notes: "" },
    fields: [
      {
        name: "starts_at",
        label: "Inicio",
        type: "datetime-local",
        required: true,
      },
      { name: "ends_at", label: "Fin", type: "datetime-local", required: true },
      { name: "address", label: "Dirección", maxLength: 500 },
      {
        name: "crew",
        label: "Equipo / colaboradores",
        type: "textarea",
        maxLength: 2000,
      },
      notes,
    ],
    schema: z
      .object({
        starts_at: z.iso.datetime({ offset: true }),
        ends_at: z.iso.datetime({ offset: true }),
        address: text(500),
        crew: text(2000),
        notes: text(10000),
      })
      .refine(
        (d) => new Date(d.ends_at) > new Date(d.starts_at),
        "El fin debe ser posterior al inicio.",
      ),
  },
  manuals: {
    module: "manualfab",
    title: "Manuales de fabricación",
    singular: "manual",
    description:
      "Medidas, materiales, instrucciones y fotografías con versiones conservadas. Corregir un manual aprobado exige nueva revisión.",
    project: true,
    statuses: {
      BORRADOR: "Borrador",
      EN_REVISION: "En revisión",
      APROBADO: "Aprobado",
      ARCHIVADO: "Archivado",
    },
    defaults: {
      measurements: "",
      materials: "",
      steps: "",
      review_note: "",
      notes: "",
    },
    fields: [
      {
        name: "measurements",
        label: "Medidas y tolerancias",
        type: "textarea",
        maxLength: 10000,
      },
      {
        name: "materials",
        label: "Materiales y piezas",
        type: "textarea",
        maxLength: 10000,
      },
      {
        name: "steps",
        label: "Pasos de fabricación y controles",
        type: "textarea",
        maxLength: 20000,
      },
      {
        name: "review_note",
        label: "Nota de revisión",
        type: "textarea",
        maxLength: 2000,
      },
      notes,
    ],
    schema: z.object({
      measurements: text(10000),
      materials: text(10000),
      steps: text(20000),
      review_note: text(2000),
      notes: text(10000),
    }),
  },
  zones: {
    module: "mapazonas",
    title: "Mapa de zonas",
    singular: "zona",
    description:
      "Zonas circulares por coordenadas, radio y proyecto. El mapa esquemático mantiene los datos dentro de la aplicación.",
    project: true,
    statuses: { ACTIVA: "Activa", INACTIVA: "Inactiva" },
    defaults: {
      latitude: "",
      longitude: "",
      radius_m: "100",
      address: "",
      notes: "",
    },
    fields: [
      { name: "latitude", label: "Latitud (−90 a 90)", required: true },
      { name: "longitude", label: "Longitud (−180 a 180)", required: true },
      {
        name: "radius_m",
        label: "Radio (metros)",
        type: "number",
        min: 10,
        max: 1000000,
        required: true,
      },
      { name: "address", label: "Dirección / referencia", maxLength: 500 },
      notes,
    ],
    schema: z.object({
      latitude: z
        .string()
        .regex(
          /^-?\d{1,3}(\.\d{1,7})?$/,
          "Escribe la latitud con punto decimal y hasta siete decimales.",
        )
        .refine(
          (v) => Math.abs(Number(v)) <= 90,
          "La latitud debe estar entre −90 y 90.",
        ),
      longitude: z
        .string()
        .regex(
          /^-?\d{1,3}(\.\d{1,7})?$/,
          "Escribe la longitud con punto decimal y hasta siete decimales.",
        )
        .refine(
          (v) => Math.abs(Number(v)) <= 180,
          "La longitud debe estar entre −180 y 180.",
        ),
      radius_m: z
        .string()
        .regex(/^\d{1,7}$/, "Escribe el radio en metros enteros.")
        .refine(
          (v) => Number(v) >= 10 && Number(v) <= 1000000,
          "El radio debe estar entre 10 y 1.000.000 metros.",
        ),
      address: text(500),
      notes: text(10000),
    }),
  },
};
export function workspaceKind(value: string): WorkKind | null {
  return workKinds.includes(value as WorkKind) ? (value as WorkKind) : null;
}
export function workspaceError(error: { code?: string; message: string }) {
  const messages: Record<string, string> = {
    schedule_overlap: "El responsable ya tiene una instalación en ese horario.",
    insufficient_stock: "La salida supera la existencia disponible.",
    unit_locked:
      "No puedes cambiar la unidad de un artículo con movimientos registrados, aunque su saldo sea cero.",
    approval_fields_required:
      "Indica número y fecha de aprobación del permiso.",
    manager_required: "Esta acción requiere un administrador.",
    steps_required: "Completa las instrucciones antes de aprobar el manual.",
    project_required: "Selecciona un proyecto.",
    project_unavailable: "El proyecto no está disponible con tus permisos.",
    worker_unavailable: "Selecciona un trabajador activo de esta empresa.",
    reason_required: "Indica un motivo de al menos tres caracteres.",
    invalid_dates: "Revisa el orden de las fechas.",
    deposit_required:
      "El proyecto necesita un anticipo registrado para comenzar o completar la instalación.",
  };
  return Object.entries(messages).find(([key]) =>
    error.message.includes(key),
  )?.[1];
}
