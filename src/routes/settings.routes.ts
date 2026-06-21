import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.middleware.js";
import { getShopSettings, updateShopSettings } from "../services/settings.service.js";

const settingsSchema = z.object({
  storeName: z.string().min(1).max(200),
  tagline: z.string().max(200),
  contactEmail: z.string().email().max(200),
  phone: z.string().min(1).max(50),
  address: z.string().max(1000),
  contacts: z.string().max(2000),
  currency: z.string().min(1).max(10),
  taxRate: z.number().nonnegative(),
  timezone: z.string().min(1).max(100),
});

export const settingsRouter = Router();

settingsRouter.use(requireAuth);

settingsRouter.get("/", async (_req, res) => {
  const settings = await getShopSettings();
  return res.json({ settings });
});

settingsRouter.put("/", async (req, res) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
  }

  const settings = await updateShopSettings(parsed.data);
  return res.json({ settings });
});
