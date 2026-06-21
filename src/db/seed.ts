import "dotenv/config";
import bcrypt from "bcrypt";
import { pool } from "./pool.js";

type SeedInput = {
  email: string;
  password: string;
  fullName: string;
};

export async function seedAdmin({ email, password, fullName }: SeedInput) {
  const passwordHash = await bcrypt.hash(password, 12);
  await pool.query(
    `
    INSERT INTO admins (email, password_hash, full_name)
    VALUES ($1, $2, $3)
    ON CONFLICT (email) DO UPDATE
      SET password_hash = EXCLUDED.password_hash,
          full_name = EXCLUDED.full_name,
          updated_at = NOW()
    `,
    [email, passwordHash, fullName],
  );
}

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const fullName = process.env.ADMIN_FULL_NAME ?? "Store Admin";

  if (!email || !password) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD are required");
  }

  await seedAdmin({ email, password, fullName });
  console.log(`Seeded admin: ${email}`);
  await pool.end();
}

const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith("seed.ts") || process.argv[1].endsWith("seed.js"));

if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
