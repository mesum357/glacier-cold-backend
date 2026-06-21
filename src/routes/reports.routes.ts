import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { getReports } from "../services/reports.service.js";

export const reportsRouter = Router();

reportsRouter.use(requireAuth);

reportsRouter.get("/", async (_req, res) => {
  const reports = await getReports();
  return res.json({ reports });
});
