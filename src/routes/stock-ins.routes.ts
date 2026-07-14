import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.middleware.js";
import { PAYMENT_STATUSES } from "../lib/payment-status.js";
import {
  applyAdvanceToSupplier,
  createStockIn,
  createStockInBatch,
  getStockInBatchByInvoiceNo,
  listRecentStockIns,
  listStockIns,
  updateStockInBatch,
  updateStockInPaymentStatus,
} from "../services/stock-ins.service.js";

const stockInSchema = z.object({
  productName: z.string().min(1).max(200),
  productCategory: z.string().min(1).max(100),
  quantity: z.number().int().positive(),
  buyingPrice: z.number().nonnegative(),
  supplierId: z.string().uuid(),
  receivedAt: z.string().datetime().optional(),
});

const stockInLineSchema = z
  .object({
    productName: z.string().min(1).max(200),
    productCategory: z.string().min(1).max(100),
    barcode: z.string().min(1).max(64).optional(),
    quantity: z.number().int().positive(),
    buyingPrice: z.number().nonnegative(),
    cartonQuantity: z.number().int().positive().optional(),
    cartonPrice: z.number().nonnegative().optional(),
    productionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .refine((d) => d.expiryDate >= d.productionDate, {
    message: "Expiry date must be on or after production date",
    path: ["expiryDate"],
  });

const stockInBatchSchema = z.object({
  supplierId: z.string().uuid(),
  receivedAt: z.string().datetime().optional(),
  paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
  advanceAmount: z.number().nonnegative().optional(),
  items: z.array(stockInLineSchema).min(1).max(50),
});

const updatePaymentStatusSchema = z.object({
  paymentStatus: z.enum(PAYMENT_STATUSES),
});

const applyAdvanceSchema = z.object({
  supplierId: z.string().uuid(),
  amount: z.number().positive(),
});

export const stockInsRouter = Router();

stockInsRouter.use(requireAuth);

stockInsRouter.get("/", async (req, res) => {
  const paymentStatus =
    typeof req.query.paymentStatus === "string" ? req.query.paymentStatus : undefined;
  const supplier = typeof req.query.supplier === "string" ? req.query.supplier : undefined;
  const product = typeof req.query.product === "string" ? req.query.product : undefined;
  const dateFrom = typeof req.query.dateFrom === "string" ? req.query.dateFrom : undefined;
  const dateTo = typeof req.query.dateTo === "string" ? req.query.dateTo : undefined;
  const timeFrom = typeof req.query.timeFrom === "string" ? req.query.timeFrom : undefined;
  const timeTo = typeof req.query.timeTo === "string" ? req.query.timeTo : undefined;

  const stockIns = await listStockIns(undefined, {
    paymentStatus:
      paymentStatus && PAYMENT_STATUSES.includes(paymentStatus as (typeof PAYMENT_STATUSES)[number])
        ? (paymentStatus as (typeof PAYMENT_STATUSES)[number])
        : undefined,
    supplier,
    product,
    dateFrom,
    dateTo,
    timeFrom,
    timeTo,
  });
  return res.json({ stockIns });
});

stockInsRouter.get("/recent", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const stockIns = await listRecentStockIns(limit);
  return res.json({ stockIns });
});

stockInsRouter.post("/apply-advance", async (req, res) => {
  const parsed = applyAdvanceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
  }

  try {
    const result = await applyAdvanceToSupplier(parsed.data.supplierId, parsed.data.amount);
    return res.json({ result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to apply advance";
    const status = message === "Supplier not found" ? 404 : 400;
    return res.status(status).json({ error: message });
  }
});

stockInsRouter.get("/by-invoice/:invoiceNo", async (req, res) => {
  const invoiceNo = Number(req.params.invoiceNo);
  if (!Number.isInteger(invoiceNo) || invoiceNo <= 0) {
    return res.status(400).json({ error: "Invalid invoice number" });
  }
  const stockIns = await getStockInBatchByInvoiceNo(invoiceNo);
  if (stockIns.length === 0) {
    return res.status(404).json({ error: "Stock-in invoice not found" });
  }
  return res.json({ stockIns });
});

stockInsRouter.put("/batch/:invoiceNo", async (req, res) => {
  const invoiceNo = Number(req.params.invoiceNo);
  if (!Number.isInteger(invoiceNo) || invoiceNo <= 0) {
    return res.status(400).json({ error: "Invalid invoice number" });
  }

  const parsed = stockInBatchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
  }

  try {
    const result = await updateStockInBatch(invoiceNo, parsed.data);
    return res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update stock in";
    return res.status(400).json({ error: message });
  }
});

stockInsRouter.post("/batch", async (req, res) => {
  const parsed = stockInBatchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
  }

  try {
    const result = await createStockInBatch(parsed.data);
    return res.status(201).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to record stock in";
    return res.status(400).json({ error: message });
  }
});

stockInsRouter.post("/", async (req, res) => {
  const parsed = stockInSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
  }

  try {
    const stockIn = await createStockIn(parsed.data);
    return res.status(201).json({ stockIn });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to record stock in";
    return res.status(400).json({ error: message });
  }
});

stockInsRouter.patch("/:id/payment-status", async (req, res) => {
  const parsed = updatePaymentStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
  }

  const stockIn = await updateStockInPaymentStatus(req.params.id, parsed.data.paymentStatus);
  if (!stockIn) return res.status(404).json({ error: "Stock-in record not found" });
  return res.json({ stockIn });
});
