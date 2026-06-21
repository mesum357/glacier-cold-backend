import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.middleware.js";
import {
  createSale,
  getSalesSummary,
  listRecentSales,
  listSales,
} from "../services/sales.service.js";

const saleItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().positive(),
});

const createSaleSchema = z.object({
  supplierName: z.string().min(1).max(200),
  saleAt: z.string().datetime().optional(),
  items: z.array(saleItemSchema).min(1),
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

  const sales = await listSales({ search, supplier, period, year });
  const summary = await getSalesSummary({ search, supplier, period, year });
  return res.json({ sales, summary });
});

salesRouter.get("/recent", async (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : 20;
  const sales = await listRecentSales(Number.isFinite(limit) ? limit : 20);
  return res.json({ sales });
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
