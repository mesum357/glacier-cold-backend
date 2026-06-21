import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.middleware.js";
import {
  createConsumer,
  getConsumerStats,
  listConsumers,
} from "../services/consumers.service.js";

const consumerSchema = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().min(1).max(50),
  email: z.string().email().max(200),
  address: z.string().max(500),
  status: z.enum(["VIP", "regular", "New"]),
});

export const consumersRouter = Router();

consumersRouter.use(requireAuth);

consumersRouter.get("/", async (_req, res) => {
  const consumers = await listConsumers();
  return res.json({ consumers });
});

consumersRouter.get("/stats", async (_req, res) => {
  const stats = await getConsumerStats();
  return res.json({ stats });
});

consumersRouter.post("/", async (req, res) => {
  const parsed = consumerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
  }

  const consumer = await createConsumer(parsed.data);
  return res.status(201).json({ consumer });
});
