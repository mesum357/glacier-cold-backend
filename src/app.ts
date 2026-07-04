import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { authRouter } from "./routes/auth.routes.js";
import { productsRouter } from "./routes/products.routes.js";
import { salesRouter } from "./routes/sales.routes.js";
import { consumersRouter } from "./routes/consumers.routes.js";
import { suppliersRouter } from "./routes/suppliers.routes.js";
import { stockInsRouter } from "./routes/stock-ins.routes.js";
import { settingsRouter } from "./routes/settings.routes.js";
import { reportsRouter } from "./routes/reports.routes.js";
import { notificationsRouter } from "./routes/notifications.routes.js";
import { backupRouter } from "./routes/backup.routes.js";

export function createApp() {
  const app = express();

  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(
    cors({
      origin: (process.env.CORS_ORIGIN ?? "http://localhost:5173")
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "25mb" }));
  app.use(cookieParser());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/products", productsRouter);
  app.use("/api/sales", salesRouter);
  app.use("/api/consumers", consumersRouter);
  app.use("/api/suppliers", suppliersRouter);
  app.use("/api/stock-ins", stockInsRouter);
  app.use("/api/settings", settingsRouter);
  app.use("/api/reports", reportsRouter);
  app.use("/api/notifications", notificationsRouter);
  app.use("/api/backup", backupRouter);

  return app;
}
