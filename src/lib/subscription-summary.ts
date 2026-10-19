import { z } from "zod";
export const pendingPlanChangeSchema = z.object({
  id: z.uuid(),
  plan_code: z.string(),
  plan: z.string(),
  amount_cents: z.number(),
  direction: z.enum(["upgrade", "downgrade"]),
  status: z.enum(["quoted", "processing", "pending_payment", "scheduled"]),
  due_cents: z.number().nullable(),
  effective_at: z.string().nullable(),
  expires_at: z.string(),
});
export const subscriptionSummarySchema = z.object({
  id: z.uuid(),
  company_id: z.uuid(),
  plan: z.string(),
  plan_code: z.string(),
  catalog_version: z.string(),
  amount_cents: z.number(),
  user_limit: z.number().nullable(),
  company_limit: z.number().nullable(),
  invoice_limit: z.number().nullable(),
  status: z.string(),
  paid_through: z.string().nullable(),
  mode: z.string(),
  cancel_at_period_end: z.boolean(),
  active_users: z.number(),
  pending_invitations: z.number(),
  companies: z.number(),
  invoices_this_month: z.number(),
  invoice_period_start: z.string(),
  invoice_period_end: z.string(),
  writable: z.boolean(),
  support: z.enum(["standard", "email", "phone"]),
  custom_website: z.boolean(),
  custom_modules: z.boolean(),
  can_reactivate: z.boolean(),
  reactivation_plan: z.string().nullable(),
  plan_change: pendingPlanChangeSchema.nullable().optional(),
});
export type SubscriptionSummaryValue = z.infer<
  typeof subscriptionSummarySchema
>;
