import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.middleware.js";
import {
  createProduct,
  deleteProduct,
  getProductStats,
  listLowStockProducts,
  listProducts,
  updateProduct,
} from "../services/products.service.js";

const productSchema = z.object({
  name: z.string().min(1).max(200),
  category: z.string().min(1).max(100),
  barcode: z.string().min(1).max(64),
  buyingPrice: z.number().nonnegative(),
  sellingPrice: z.number().nonnegative(),
  quantity: z.number().int().nonnegative(),
  thresholdLimit: z.number().int().nonnegative(),
});

export const productsRouter = Router();

productsRouter.use(requireAuth);

productsRouter.get("/", async (_req, res) => {
  const products = await listProducts();
  return res.json({ products });
});

productsRouter.get("/stats", async (_req, res) => {
  const stats = await getProductStats();
  return res.json({ stats });
});

productsRouter.get("/low-stock", async (_req, res) => {
  const products = await listLowStockProducts();
  return res.json({ products });
});

productsRouter.post("/", async (req, res) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
  }

  try {
    const product = await createProduct(parsed.data);
    return res.status(201).json({ product });
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      return res.status(409).json({ error: "A product with this barcode already exists" });
    }
    throw err;
  }
});

productsRouter.put("/:id", async (req, res) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
  }

  try {
    const product = await updateProduct(req.params.id, parsed.data);
    if (!product) return res.status(404).json({ error: "Product not found" });
    return res.json({ product });
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      return res.status(409).json({ error: "A product with this barcode already exists" });
    }
    throw err;
  }
});

productsRouter.delete("/:id", async (req, res) => {
  const deleted = await deleteProduct(req.params.id);
  if (!deleted) return res.status(404).json({ error: "Product not found" });
  return res.json({ ok: true });
});
