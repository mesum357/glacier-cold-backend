import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.middleware.js";
import {
  createStockIn,
  createStockInBatch,
  listRecentStockIns,
  listStockIns,
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
    quantity: z.number().int().positive(),
    buyingPrice: z.number().nonnegative(),
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
  items: z.array(stockInLineSchema).min(1).max(50),
});

export const stockInsRouter = Router();

stockInsRouter.use(requireAuth);

stockInsRouter.get("/", async (_req, res) => {
  const stockIns = await listStockIns();
  return res.json({ stockIns });
});

stockInsRouter.get("/recent", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const stockIns = await listRecentStockIns(limit);
  return res.json({ stockIns });
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
