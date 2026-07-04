import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { isPartyReportPeriod, type PartyReportPeriod } from "../lib/report-periods.js";
import {
  getConsumerReport,
  getReports,
  getSupplierReport,
} from "../services/reports.service.js";

export const reportsRouter = Router();

reportsRouter.use(requireAuth);

function parsePartyPeriod(value: unknown): PartyReportPeriod | null {
  if (typeof value === "string" && isPartyReportPeriod(value)) {
    return value;
  }
  return null;
}

function parseYear(value: unknown): number | undefined {
  if (typeof value === "string" && /^\d{4}$/.test(value)) {
    return Number(value);
  }
  if (typeof value === "number" && Number.isInteger(value) && value >= 2000 && value <= 2100) {
    return value;
  }
  return undefined;
}

reportsRouter.get("/", async (req, res) => {
  const date = typeof req.query.date === "string" ? req.query.date : undefined;
  try {
    const reports = await getReports(date);
    return res.json({ reports });
  } catch (err) {
    console.error("GET /api/reports failed:", err);
    const message = err instanceof Error ? err.message : "Failed to load reports";
    return res.status(500).json({ error: message });
  }
});

reportsRouter.get("/consumer", async (req, res) => {
  const consumerId = typeof req.query.consumerId === "string" ? req.query.consumerId : "";
  const period = parsePartyPeriod(req.query.period) ?? "today";
  const date = typeof req.query.date === "string" ? req.query.date : undefined;
  const year = parseYear(req.query.year);

  if (!consumerId) {
    return res.status(400).json({ error: "consumerId is required" });
  }

  try {
    const report = await getConsumerReport(consumerId, period, date, year);
    return res.json({ report });
  } catch (err) {
    console.error("GET /api/reports/consumer failed:", err);
    const message = err instanceof Error ? err.message : "Failed to load consumer report";
    const status = message === "Consumer not found" ? 404 : 500;
    return res.status(status).json({ error: message });
  }
});

reportsRouter.get("/supplier", async (req, res) => {
  const supplierId = typeof req.query.supplierId === "string" ? req.query.supplierId : "";
  const period = parsePartyPeriod(req.query.period) ?? "today";
  const date = typeof req.query.date === "string" ? req.query.date : undefined;
  const year = parseYear(req.query.year);

  if (!supplierId) {
    return res.status(400).json({ error: "supplierId is required" });
  }

  try {
    const report = await getSupplierReport(supplierId, period, date, year);
    return res.json({ report });
  } catch (err) {
    console.error("GET /api/reports/supplier failed:", err);
    const message = err instanceof Error ? err.message : "Failed to load supplier report";
    const status = message === "Supplier not found" ? 404 : 500;
    return res.status(status).json({ error: message });
  }
});
