import { describe, it, expect } from "vitest";
import { pool } from "./pool.js";

describe("database pool", () => {
  it("connects to PostgreSQL", async () => {
    const result = await pool.query("SELECT 1 AS ok");
    expect(result.rows[0].ok).toBe(1);
  });
});
