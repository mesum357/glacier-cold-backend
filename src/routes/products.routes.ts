import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.middleware.js";
import {
  createProduct,
  deleteProduct,
  getProductStats,
  listExpiringSoonProducts,
  listLowStockProducts,
  listProducts,
  reconcileInventory,
  updateProduct,
  type ProductInput,
} from "../services/products.service.js";

const productSchema = z
  .object({
    name: z.string().min(1).max(200),
    category: z.string().min(1).max(100),
    barcode: z.string().min(1).max(64),
    buyingPrice: z.number().nonnegative(),
    sellingPrice: z.number().nonnegative(),
    quantity: z.number().int().nonnegative(),
    thresholdLimit: z.number().int().nonnegative().nullable().optional(),
    productionDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    expiryDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    expiryAlertDays: z.number().int().positive().nullable().optional(),
  })
  .refine(
    (data) => !data.productionDate || !data.expiryDate || data.expiryDate >= data.productionDate,
    { message: "Expiry date must be on or after production date", path: ["expiryDate"] },
  );

function normalizeProductInput(data: z.infer<typeof productSchema>): ProductInput {
  return {
    ...data,
    thresholdLimit: data.thresholdLimit ?? null,
  };
}

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

productsRouter.get("/expiring-soon", async (_req, res) => {
  const products = await listExpiringSoonProducts();
  return res.json({ products });
});

productsRouter.post("/reconcile-inventory", async (_req, res) => {
  const adjustments = await reconcileInventory();
  return res.json({ adjustments });
});

productsRouter.post("/", async (req, res) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
  }

  try {
    const product = await createProduct(normalizeProductInput(parsed.data));
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
    const product = await updateProduct(req.params.id, normalizeProductInput(parsed.data));
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
  try {
    await deleteProduct(req.params.id);
    return res.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete product";
    if (message === "Product not found") {
      return res.status(404).json({ error: message });
    }
    return res.status(400).json({ error: message });
  }
});
