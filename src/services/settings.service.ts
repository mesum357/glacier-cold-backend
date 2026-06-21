import { pool } from "../db/pool.js";

export type ShopSettings = {
  storeName: string;
  tagline: string;
  contactEmail: string;
  phone: string;
  address: string;
  contacts: string;
  currency: string;
  taxRate: number;
  timezone: string;
  updatedAt: string;
};

export type ShopSettingsInput = {
  storeName: string;
  tagline: string;
  contactEmail: string;
  phone: string;
  address: string;
  contacts: string;
  currency: string;
  taxRate: number;
  timezone: string;
};

function mapRow(row: Record<string, unknown>): ShopSettings {
  return {
    storeName: row.store_name as string,
    tagline: row.tagline as string,
    contactEmail: row.contact_email as string,
    phone: row.phone as string,
    address: row.address as string,
    contacts: (row.contacts as string) ?? "",
    currency: row.currency as string,
    taxRate: Number(row.tax_rate),
    timezone: row.timezone as string,
    updatedAt: (row.updated_at as Date).toISOString(),
  };
}

export async function getShopSettings(): Promise<ShopSettings> {
  const { rows } = await pool.query(`SELECT * FROM shop_settings WHERE id = 1`);
  if (!rows[0]) {
    throw new Error("Shop settings not configured");
  }
  return mapRow(rows[0]);
}

export async function updateShopSettings(input: ShopSettingsInput): Promise<ShopSettings> {
  const { rows } = await pool.query(
    `
    UPDATE shop_settings
    SET store_name = $1,
        tagline = $2,
        contact_email = $3,
        phone = $4,
        address = $5,
        contacts = $6,
        currency = $7,
        tax_rate = $8,
        timezone = $9,
        updated_at = NOW()
    WHERE id = 1
    RETURNING *
    `,
    [
      input.storeName.trim(),
      input.tagline.trim(),
      input.contactEmail.trim(),
      input.phone.trim(),
      input.address.trim(),
      input.contacts.trim(),
      input.currency.trim(),
      input.taxRate,
      input.timezone.trim(),
    ],
  );
  return mapRow(rows[0]);
}

export function settingsToCompany(settings: ShopSettings) {
  return {
    name: settings.storeName,
    tagline: settings.tagline,
    email: settings.contactEmail,
    phone: settings.phone,
    addressLines: settings.address.split("\n").map((l) => l.trim()).filter(Boolean),
    contacts: parseContactLines(settings.contacts),
    currency: settings.currency,
  };
}

export function parseContactLines(contacts: string) {
  return contacts
    .split("\n")
    .map((line) => {
      const idx = line.indexOf(":");
      if (idx === -1) return { name: line.trim(), phone: "" };
      return {
        name: line.slice(0, idx).trim(),
        phone: line.slice(idx + 1).trim(),
      };
    })
    .filter((c) => c.name);
}
