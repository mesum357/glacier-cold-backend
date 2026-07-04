import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.middleware.js";
import {
  createSupplier,
  deleteSupplier,
  getSupplierStats,
  listSuppliers,
  updateSupplier,
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

suppliersRouter.put("/:id", async (req, res) => {
  const parsed = supplierSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
  }

  const supplier = await updateSupplier(req.params.id, parsed.data);
  if (!supplier) return res.status(404).json({ error: "Supplier not found" });
  return res.json({ supplier });
});

suppliersRouter.delete("/:id", async (req, res) => {
  try {
    await deleteSupplier(req.params.id);
    return res.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete supplier";
    const status = message.includes("not found") ? 404 : 400;
    return res.status(status).json({ error: message });
  }
});
