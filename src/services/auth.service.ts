import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { pool } from "../db/pool.js";
import { env } from "../config.js";

export type AdminUser = {
  id: string;
  email: string;
  fullName: string;
};

const AUTH_COOKIE = "glacier_session";

export function getAuthCookieName() {
  return AUTH_COOKIE;
}

export async function findAdminByEmail(email: string) {
  const { rows } = await pool.query(
    "SELECT id, email, password_hash, full_name FROM admins WHERE email = $1",
    [email.toLowerCase()],
  );
  return rows[0] ?? null;
}

export async function loginAdmin(email: string, password: string) {
  const admin = await findAdminByEmail(email);
  if (!admin) throw new Error("Invalid credentials");

  const valid = await bcrypt.compare(password, admin.password_hash);
  if (!valid) throw new Error("Invalid credentials");

  const user: AdminUser = {
    id: admin.id,
    email: admin.email,
    fullName: admin.full_name,
  };

  const token = jwt.sign(
    { sub: user.id, email: user.email, name: user.fullName },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"] },
  );

  return { admin: user, token };
}

export function verifyToken(token: string) {
  return jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload & {
    sub: string;
    email: string;
    name: string;
  };
}

export function cookieOptions() {
  const secure =
    process.env.COOKIE_SECURE === "true" ||
    (process.env.COOKIE_SECURE !== "false" && env.NODE_ENV === "production");
  const domain = process.env.COOKIE_DOMAIN?.trim();
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
    ...(domain ? { domain } : {}),
  };
}

export async function changeAdminPassword(
  adminId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const { rows } = await pool.query(
    `SELECT password_hash FROM admins WHERE id = $1`,
    [adminId],
  );
  const admin = rows[0];
  if (!admin) throw new Error("Admin not found");

  const valid = await bcrypt.compare(currentPassword, admin.password_hash);
  if (!valid) throw new Error("Current password is incorrect");

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await pool.query(
    `UPDATE admins SET password_hash = $2, updated_at = NOW() WHERE id = $1`,
    [adminId, passwordHash],
  );
}
