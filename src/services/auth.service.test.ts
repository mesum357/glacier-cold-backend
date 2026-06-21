import { describe, it, expect, beforeAll } from "vitest";
import { pool } from "../db/pool.js";
import { seedAdmin } from "../db/seed.js";
import { loginAdmin, verifyToken } from "./auth.service.js";

describe("auth.service", () => {
  beforeAll(async () => {
    process.env.JWT_SECRET = "test-secret-at-least-16-chars";
    await pool.query("DELETE FROM admins");
    await seedAdmin({
      email: "admin@glacier.shop",
      password: "CorrectHorse123!",
      fullName: "Jane Doe",
    });
  });

  it("loginAdmin returns token for valid credentials", async () => {
    const result = await loginAdmin("admin@glacier.shop", "CorrectHorse123!");
    expect(result.admin.email).toBe("admin@glacier.shop");
    expect(result.token).toBeTruthy();
    expect(verifyToken(result.token).sub).toBe(result.admin.id);
  });

  it("loginAdmin throws for invalid password", async () => {
    await expect(loginAdmin("admin@glacier.shop", "wrong")).rejects.toThrow("Invalid credentials");
  });
});
