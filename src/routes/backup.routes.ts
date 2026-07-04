import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { exportBackup, restoreBackup } from "../services/backup.service.js";

export const backupRouter = Router();

backupRouter.use(requireAuth);

backupRouter.get("/", async (_req, res) => {
  try {
    const backup = await exportBackup();
    const date = new Date().toISOString().slice(0, 10);
    const filename = `glacier-pos-backup-${date}.json`;

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(JSON.stringify(backup, null, 2));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create backup";
    return res.status(500).json({ error: message });
  }
});

backupRouter.post("/restore", async (req, res) => {
  try {
    const result = await restoreBackup(req.body);
    return res.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to restore backup";
    return res.status(400).json({ error: message });
  }
});
