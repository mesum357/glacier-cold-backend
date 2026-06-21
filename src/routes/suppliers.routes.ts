import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.middleware.js";
import {
  createSupplier,
  getSupplierStats,
  listSuppliers,
} from "../services/suppliers.service.js";

const supplierSchema = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().min(1).max(50),
  email: z.string().email().max(200),
  address: z.string().max(500),
});

export const suppliersRouter = Router();

suppliersRouter.use(requireAuth);

suppliersRouter.get("/", async (_req, res) => {
  const suppliers = await listSuppliers();
  return res.json({ suppliers });
});

suppliersRouter.get("/stats", async (_req, res) => {
  const stats = await getSupplierStats();
  return res.json({ stats });
});

suppliersRouter.post("/", async (req, res) => {
  const parsed = supplierSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
  }

  const supplier = await createSupplier(parsed.data);
  return res.status(201).json({ supplier });
});
