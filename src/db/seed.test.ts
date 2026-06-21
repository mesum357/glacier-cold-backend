import { describe, it, expect, beforeAll } from "vitest";
import bcrypt from "bcrypt";
import { pool } from "./pool.js";
import { seedAdmin } from "./seed.js";

describe("seedAdmin", () => {
  beforeAll(async () => {
    await pool.query("DELETE FROM admins");
  });

  it("creates admin with hashed password", async () => {
    await seedAdmin({
      email: "admin@glacier.shop",
      password: "TestPass123!",
      fullName: "Jane Doe",
    });

    const { rows } = await pool.query("SELECT * FROM admins WHERE email = $1", [
      "admin@glacier.shop",
    ]);
    expect(rows).toHaveLength(1);
    expect(await bcrypt.compare("TestPass123!", rows[0].password_hash)).toBe(true);
  });
});
