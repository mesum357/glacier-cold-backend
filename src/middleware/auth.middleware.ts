import type { Request, Response, NextFunction } from "express";
import { getAuthCookieName, verifyToken } from "../services/auth.service.js";

export type AuthedRequest = Request & {
  admin?: { id: string; email: string; fullName: string };
};

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = req.cookies?.[getAuthCookieName()];
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    const payload = verifyToken(token);
    req.admin = {
      id: payload.sub,
      email: payload.email,
      fullName: payload.name,
    };
    next();
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
}
