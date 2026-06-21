import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { pool } from "../db/pool.js";
import { seedAdmin } from "../db/seed.js";

describe("auth routes", () => {
  beforeAll(async () => {
    process.env.JWT_SECRET = "test-secret-at-least-16-chars";
    await pool.query("DELETE FROM admins");
    await seedAdmin({
      email: "admin@glacier.shop",
      password: "CorrectHorse123!",
      fullName: "Jane Doe",
    });
  });

  it("POST /api/auth/login sets cookie and returns admin", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@glacier.shop", password: "CorrectHorse123!" });

    expect(res.status).toBe(200);
    expect(res.body.admin.email).toBe("admin@glacier.shop");
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("GET /api/auth/me returns 401 without cookie", async () => {
    const app = createApp();
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });
});
