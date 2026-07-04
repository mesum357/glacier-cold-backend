import { pool } from "../db/pool.js";
import {
  DATA_TABLES,
  DEFAULT_SHOP_CONTACTS,
  INSERT_COLUMNS,
  SUPPORTED_BACKUP_VERSIONS,
  TABLE_EXPORT_ORDER,
  buildInsertValues,
  normalizeBackupTables,
  prepareTablesForRestore,
  resolveInvoiceSequences,
  type BackupTables,
  type DataTable,
} from "./backup-restore.utils.js";

export const BACKUP_VERSION = 4;

export type BackupPayload = {
  version: number;
  app: "glacier-pos";
  exportedAt: string;
  sequences: {
    stockInInvoiceNo: number;
    salesInvoiceNo: number;
    /** @deprecated Legacy global max from backups before v4 */
    invoiceNo?: number;
  };
  summary: Record<DataTable, number>;
  tables: BackupTables;
};

function serializeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value instanceof Date) {
      out[key] = value.toISOString();
    } else {
      out[key] = value;
    }
  }
  return out;
}

async function fetchTable(table: DataTable): Promise<Record<string, unknown>[]> {
  const orderClause = TABLE_EXPORT_ORDER[table] ?? "";
  const { rows } = await pool.query(`SELECT * FROM ${table} ${orderClause}`);
  return rows.map((row) => serializeRow(row as Record<string, unknown>));
}

async function getInvoiceSequences(): Promise<{ stockInInvoiceNo: number; salesInvoiceNo: number }> {
  const { rows } = await pool.query<{
    max_stock_in: string | null;
    max_sales: string | null;
  }>(`
    SELECT
      COALESCE((SELECT MAX(invoice_no) FROM stock_ins), 0)::text AS max_stock_in,
      COALESCE((SELECT MAX(invoice_no) FROM sales), 0)::text AS max_sales
  `);
  return {
    stockInInvoiceNo: Number(rows[0]?.max_stock_in ?? 0),
    salesInvoiceNo: Number(rows[0]?.max_sales ?? 0),
  };
}

function buildSummary(tables: BackupTables): Record<DataTable, number> {
  return Object.fromEntries(
    DATA_TABLES.map((table) => [table, tables[table].length]),
  ) as Record<DataTable, number>;
}

export async function exportBackup(): Promise<BackupPayload> {
  const tableData = await Promise.all(DATA_TABLES.map((table) => fetchTable(table)));
  const tables = Object.fromEntries(
    DATA_TABLES.map((table, index) => [table, tableData[index]]),
  ) as BackupTables;

  return {
    version: BACKUP_VERSION,
    app: "glacier-pos",
    exportedAt: new Date().toISOString(),
    sequences: await getInvoiceSequences(),
    summary: buildSummary(tables),
    tables,
  };
}

function assertBackupPayload(data: unknown): BackupPayload {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid backup file");
  }

  const payload = data as BackupPayload;
  if (
    payload.app !== "glacier-pos" ||
    !SUPPORTED_BACKUP_VERSIONS.includes(payload.version as (typeof SUPPORTED_BACKUP_VERSIONS)[number])
  ) {
    throw new Error("Unsupported backup file version");
  }
  if (!payload.tables || typeof payload.tables !== "object") {
    throw new Error("Backup file is missing table data");
  }

  const tables = normalizeBackupTables(payload.tables, payload.version);

  return {
    ...payload,
    summary: payload.summary ?? buildSummary(tables),
    tables,
  };
}

async function insertRows(
  client: import("pg").PoolClient,
  table: Exclude<DataTable, "shop_settings" | "admins">,
  rows: Record<string, unknown>[],
) {
  if (rows.length === 0) return;

  const columns = INSERT_COLUMNS[table];
  const colList = columns.map((column) => `"${column}"`).join(", ");
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");

  for (const row of rows) {
    await client.query(
      `INSERT INTO ${table} (${colList}) VALUES (${placeholders})`,
      buildInsertValues(table, row),
    );
  }
}

async function upsertShopSettings(
  client: import("pg").PoolClient,
  rows: Record<string, unknown>[],
) {
  const settings = rows[0];
  if (!settings) return;

  await client.query(
    `
    INSERT INTO shop_settings (
      id, store_name, tagline, contact_email, phone, address, currency, tax_rate, timezone, contacts, updated_at
    )
    VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10::timestamptz, NOW()))
    ON CONFLICT (id) DO UPDATE SET
      store_name = EXCLUDED.store_name,
      tagline = EXCLUDED.tagline,
      contact_email = EXCLUDED.contact_email,
      phone = EXCLUDED.phone,
      address = EXCLUDED.address,
      currency = EXCLUDED.currency,
      tax_rate = EXCLUDED.tax_rate,
      timezone = EXCLUDED.timezone,
      contacts = EXCLUDED.contacts,
      updated_at = EXCLUDED.updated_at
    `,
    [
      settings.store_name,
      settings.tagline,
      settings.contact_email,
      settings.phone,
      settings.address,
      settings.currency,
      settings.tax_rate,
      settings.timezone,
      settings.contacts ?? DEFAULT_SHOP_CONTACTS,
      settings.updated_at ?? null,
    ],
  );
}

async function upsertAdmins(
  client: import("pg").PoolClient,
  rows: Record<string, unknown>[],
) {
  for (const admin of rows) {
    await client.query(
      `
      INSERT INTO admins (id, email, password_hash, full_name, created_at, updated_at)
      VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, NOW()), COALESCE($6::timestamptz, NOW()))
      ON CONFLICT (email) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        full_name = EXCLUDED.full_name,
        updated_at = EXCLUDED.updated_at
      `,
      [
        admin.id,
        admin.email,
        admin.password_hash,
        admin.full_name,
        admin.created_at ?? null,
        admin.updated_at ?? null,
      ],
    );
  }
}

export async function restoreBackup(data: unknown): Promise<{
  restored: Record<string, number>;
}> {
  const payload = assertBackupPayload(data);
  const prepared = prepareTablesForRestore(payload.tables);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(`
      TRUNCATE TABLE
        sale_items,
        sales,
        stock_ins,
        products,
        consumers,
        suppliers
      RESTART IDENTITY CASCADE
    `);

    await insertRows(client, "suppliers", prepared.suppliers);
    await insertRows(client, "consumers", prepared.consumers);
    await insertRows(client, "products", prepared.products);
    await insertRows(client, "sales", prepared.sales);
    await insertRows(client, "sale_items", prepared.sale_items);
    await insertRows(client, "stock_ins", prepared.stock_ins);
    await upsertShopSettings(client, prepared.shop_settings);
    await upsertAdmins(client, prepared.admins);

    const invoiceSequences = resolveInvoiceSequences(prepared, payload.sequences ?? {});
    await client.query(`SELECT setval('stock_in_invoice_no_seq', $1, $2)`, [
      Math.max(invoiceSequences.stockInInvoiceNo, 1),
      invoiceSequences.stockInInvoiceNo > 0,
    ]);
    await client.query(`SELECT setval('sales_invoice_no_seq', $1, $2)`, [
      Math.max(invoiceSequences.salesInvoiceNo, 1),
      invoiceSequences.salesInvoiceNo > 0,
    ]);

    await client.query("COMMIT");

    return {
      restored: buildSummary(prepared),
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
