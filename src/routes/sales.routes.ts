import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.middleware.js";
import { PAYMENT_STATUSES } from "../lib/payment-status.js";
import {
  applyAdvanceToConsumer,
  createSale,
  getSaleById,
  getSalesSummary,
  listRecentSales,
  listSales,
  softDeleteSale,
  updateSale,
  updateSalePaymentStatus,
} from "../services/sales.service.js";

const saleItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative().optional(),
  cartonQuantity: z.number().int().positive().optional(),
  cartonPrice: z.number().nonnegative().optional(),
  paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
});

const createSaleSchema = z.object({
  supplierName: z.string().min(1).max(200),
  saleAt: z.string().datetime().optional(),
  paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
  advanceAmount: z.number().nonnegative().optional(),
  items: z.array(saleItemSchema).min(1),
});

const updatePaymentStatusSchema = z.object({
  paymentStatus: z.enum(PAYMENT_STATUSES),
});

const applyAdvanceSchema = z.object({
  consumerId: z.string().uuid(),
  amount: z.number().positive(),
});

export const salesRouter = Router();

salesRouter.use(requireAuth);

salesRouter.get("/", async (req, res) => {
  const search = typeof req.query.search === "string" ? req.query.search : undefined;
  const supplier = typeof req.query.supplier === "string" ? req.query.supplier : undefined;
  const period = typeof req.query.period === "string" ? req.query.period : undefined;
  const year =
    typeof req.query.year === "string" && req.query.year
      ? Number(req.query.year)
      : undefined;
  const paymentStatus =
    typeof req.query.paymentStatus === "string" ? req.query.paymentStatus : undefined;

  const filters = {
    search,
    supplier,
    period,
    year,
    paymentStatus:
      paymentStatus && PAYMENT_STATUSES.includes(paymentStatus as (typeof PAYMENT_STATUSES)[number])
        ? (paymentStatus as (typeof PAYMENT_STATUSES)[number])
        : undefined,
  };

  const sales = await listSales(filters);
  const summary = await getSalesSummary(filters);
  return res.json({ sales, summary });
});

salesRouter.get("/recent", async (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : 20;
  const sales = await listRecentSales(Number.isFinite(limit) ? limit : 20);
  return res.json({ sales });
});

salesRouter.post("/apply-advance", async (req, res) => {
  const parsed = applyAdvanceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
  }

  try {
    const result = await applyAdvanceToConsumer(parsed.data.consumerId, parsed.data.amount);
    return res.json({ result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to apply advance";
    const status = message === "Consumer not found" ? 404 : 400;
    return res.status(status).json({ error: message });
  }
});

salesRouter.get("/:id", async (req, res) => {
  const sale = await getSaleById(req.params.id);
  if (!sale) return res.status(404).json({ error: "Sale not found" });
  return res.json({ sale });
});

salesRouter.put("/:id", async (req, res) => {
  const parsed = createSaleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
  }

  try {
    const sale = await updateSale(req.params.id, parsed.data);
    return res.json({ sale });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update sale";
    const status = message === "Sale not found" ? 404 : 400;
    return res.status(status).json({ error: message });
  }
});

salesRouter.post("/", async (req, res) => {
  const parsed = createSaleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
  }

  try {
    const sale = await createSale(parsed.data);
    return res.status(201).json({ sale });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create sale";
    return res.status(400).json({ error: message });
  }
});

salesRouter.patch("/:id/payment-status", async (req, res) => {
  const parsed = updatePaymentStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
  }

  const sale = await updateSalePaymentStatus(req.params.id, parsed.data.paymentStatus);
  if (!sale) return res.status(404).json({ error: "Sale not found" });
  return res.json({ sale });
});

salesRouter.delete("/:id", async (req, res) => {
  try {
    const sale = await softDeleteSale(req.params.id);
    return res.json({ sale });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to remove invoice";
    const status = message === "Sale not found" ? 404 : 400;
    return res.status(status).json({ error: message });
  }
});
