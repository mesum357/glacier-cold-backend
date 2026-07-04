import "dotenv/config";
import bcrypt from "bcrypt";
import { pool } from "./pool.js";

type SeedInput = {
  email: string;
  password: string;
  fullName: string;
};

export async function seedShopSettings() {
  await pool.query(
    `
    INSERT INTO shop_settings (
      id, store_name, tagline, contact_email, phone, address, currency, tax_rate, timezone, contacts
    )
    VALUES (
      1,
      'GLACIER COLD STORAGE',
      'Shop Management',
      'hello@glacier.shop',
      '+92 300 1234567',
      'Shaheed Saif Ur Rehman Hospital River View Road Gilgit',
      'PKR',
      0,
      'Asia/Karachi',
      $1
    )
    ON CONFLICT (id) DO NOTHING
    `,
    ["Rizwan Akbar: 0355-5454859\nTauqeer Ahmed: 0311-1028883"],
  );
}

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

  await seedShopSettings();
  await seedAdmin({ email, password, fullName });
  console.log(`Seeded shop settings and admin: ${email}`);
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
