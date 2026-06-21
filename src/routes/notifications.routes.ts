import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { listStockAlerts } from "../services/notifications.service.js";

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);

notificationsRouter.get("/", async (_req, res) => {
  const notifications = await listStockAlerts();
  return res.json({ notifications, unreadCount: notifications.length });
});
