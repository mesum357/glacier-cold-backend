import { Router } from "express";
import { z } from "zod";
import {
  cookieOptions,
  getAuthCookieName,
  loginAdmin,
  changeAdminPassword,
} from "../services/auth.service.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.middleware.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const authRouter = Router();

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
  }

  try {
    const { admin, token } = await loginAdmin(parsed.data.email, parsed.data.password);
    res.cookie(getAuthCookieName(), token, cookieOptions());
    return res.json({ admin });
  } catch {
    return res.status(401).json({ error: "Invalid email or password" });
  }
});

authRouter.post("/logout", (_req, res) => {
  res.clearCookie(getAuthCookieName(), cookieOptions());
  return res.json({ ok: true });
});

authRouter.get("/me", requireAuth, (req: AuthedRequest, res) => {
  return res.json({ admin: req.admin });
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(8),
  newPassword: z.string().min(8),
});

authRouter.post("/change-password", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
  }

  if (parsed.data.currentPassword === parsed.data.newPassword) {
    return res.status(400).json({ error: "New password must be different from current password" });
  }

  try {
    await changeAdminPassword(
      req.admin!.id,
      parsed.data.currentPassword,
      parsed.data.newPassword,
    );
    return res.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to change password";
    return res.status(400).json({ error: message });
  }
});
