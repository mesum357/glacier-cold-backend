import { pool } from "../db/pool.js";
import { formatDateOnly } from "../lib/date-only.js";
import { roundMoney, validateAdvanceAmount } from "../lib/money.js";
import { type PaymentStatus } from "../lib/payment-status.js";
import { batchItemsMatch } from "./stock-in-batch-utils.js";
import { computeStockInQuantityDeltas } from "./stock-in-quantity-deltas.js";
import { allocateStockInInvoiceNo } from "./invoice-no.service.js";
import { getSupplierById } from "./suppliers.service.js";

export type { PaymentStatus };

export type StockIn = {
  id: string;
  invoiceNo: number;
  productId: string;
  productName: string;
  productCategory: string;
  quantity: number;
  buyingPrice: number;
  supplierId: string;
  supplierName: string;
  productionDate: string | null;
  expiryDate: string | null;
  cartonQuantity: number | null;
  cartonPrice: number | null;
  paymentStatus: PaymentStatus;
  advanceAmount: number;
  lineOrder: number;
  receivedAt: string;
  createdAt: string;
};

export type CreateStockInInput = {
  productName: string;
  productCategory: string;
  quantity: number;
  buyingPrice: number;
  supplierId: string;
  receivedAt?: string;
};

export type StockInLineInput = {
  productName: string;
  productCategory: string;
  barcode?: string;
  quantity: number;
  buyingPrice: number;
  cartonQuantity?: number;
  cartonPrice?: number;
  productionDate: string;
  expiryDate: string;
};

export type CreateStockInBatchInput = {
  supplierId: string;
  receivedAt?: string;
  paymentStatus?: PaymentStatus;
  advanceAmount?: number;
  items: StockInLineInput[];
};

export type StockInFilters = {
  paymentStatus?: PaymentStatus;
  supplier?: string;
  product?: string;
  dateFrom?: string;
  dateTo?: string;
  timeFrom?: string;
  timeTo?: string;
};

function mapRow(row: Record<string, unknown>): StockIn {
  return {
    id: row.id as string,
    invoiceNo: Number(row.invoice_no),
    productId: row.product_id as string,
    productName: row.product_name as string,
    productCategory: row.product_category as string,
    quantity: Number(row.quantity),
    buyingPrice: Number(row.buying_price),
    supplierId: row.supplier_id as string,
    supplierName: row.supplier_name as string,
    productionDate: row.production_date
      ? formatDateOnly(row.production_date as Date | string)
      : null,
    expiryDate: row.expiry_date
      ? formatDateOnly(row.expiry_date as Date | string)
      : null,
    paymentStatus: row.payment_status as PaymentStatus,
    advanceAmount: Number(row.advance_amount ?? 0),
    cartonQuantity:
      row.carton_quantity === null || row.carton_quantity === undefined
        ? null
        : Number(row.carton_quantity),
    cartonPrice:
      row.carton_price === null || row.carton_price === undefined
        ? null
        : Number(row.carton_price),
    lineOrder: Number(row.line_order ?? 0),
    receivedAt: (row.received_at as Date).toISOString(),
    createdAt: (row.created_at as Date).toISOString(),
  };
}

function generateBarcode() {
  return `AUTO-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function stockInInvoiceTotal(items: StockInLineInput[]): number {
  return roundMoney(
    items.reduce((sum, item) => sum + roundMoney(item.quantity * item.buyingPrice), 0),
  );
}

function resolveStockInBatchMeta(input: CreateStockInBatchInput): {
  paymentStatus: PaymentStatus;
  advanceAmount: number;
} {
  const paymentStatus = input.paymentStatus ?? "pending";
  const advanceAmount = roundMoney(input.advanceAmount ?? 0);
  validateAdvanceAmount(advanceAmount, stockInInvoiceTotal(input.items));
  return { paymentStatus, advanceAmount };
}

export function validateStockInBatchInput(input: CreateStockInBatchInput): void {
  if (!input.items.length) {
    throw new Error("At least one product line is required");
  }

  for (const item of input.items) {
    if (item.expiryDate < item.productionDate) {
      throw new Error("Expiry date must be on or after production date");
    }
    if (item.quantity <= 0) {
      throw new Error("Quantity must be greater than zero");
    }
    if (item.cartonQuantity != null && item.cartonQuantity <= 0) {
      throw new Error("Carton quantity must be greater than zero");
    }
    if (item.cartonPrice != null && item.cartonPrice < 0) {
      throw new Error("Carton price must be zero or greater");
    }
  }
}

type ResolvedStockInLine = {
  item: StockInLineInput;
  productId: string;
  isNewProduct: boolean;
};

async function findExistingProductForStockInLine(
  client: import("pg").PoolClient,
  item: StockInLineInput,
): Promise<Record<string, unknown> | null> {
  const name = item.productName.trim();
  const category = item.productCategory.trim();
  const barcode = item.barcode?.trim() || "";

  if (barcode) {
    const byBarcode = await client.query(`SELECT * FROM products WHERE barcode = $1 FOR UPDATE`, [
      barcode,
    ]);
    if (byBarcode.rows[0]) return byBarcode.rows[0];
  }

  const byName = await client.query(
    `
    SELECT * FROM products
    WHERE LOWER(name) = LOWER($1) AND LOWER(category) = LOWER($2)
    FOR UPDATE
    `,
    [name, category],
  );

  return byName.rows[0] ?? null;
}

async function createProductForStockInLine(
  client: import("pg").PoolClient,
  item: StockInLineInput,
  quantity: number,
): Promise<string> {
  const name = item.productName.trim();
  const category = item.productCategory.trim();
  const barcode = item.barcode?.trim() || generateBarcode();
  const { rows } = await client.query(
    `
    INSERT INTO products (
      name, category, barcode, buying_price, selling_price, quantity, threshold_limit,
      production_date, expiry_date
    )
    VALUES ($1, $2, $3, $4, NULL, $5, NULL, $6, $7)
    RETURNING id
    `,
    [name, category, barcode, item.buyingPrice, quantity, item.productionDate, item.expiryDate],
  );
  return rows[0].id as string;
}

async function updateProductMetadataForStockInLine(
  client: import("pg").PoolClient,
  productId: string,
  item: StockInLineInput,
): Promise<void> {
  await client.query(
    `
    UPDATE products
    SET buying_price = $2,
        production_date = $3,
        expiry_date = $4,
        updated_at = NOW()
    WHERE id = $1
    `,
    [productId, item.buyingPrice, item.productionDate, item.expiryDate],
  );
}

async function insertStockInRecord(
  client: import("pg").PoolClient,
  supplier: { id: string; name: string },
  receivedAt: Date,
  invoiceNo: number,
  lineOrder: number,
  productId: string,
  item: StockInLineInput,
  batchMeta: { paymentStatus: PaymentStatus; advanceAmount: number },
): Promise<StockIn> {
  const name = item.productName.trim();
  const category = item.productCategory.trim();
  const { rows: stockInRows } = await client.query(
    `
    INSERT INTO stock_ins (
      product_id, product_name, product_category, quantity, buying_price,
      supplier_id, supplier_name, received_at, invoice_no, production_date, expiry_date,
      payment_status, advance_amount, carton_quantity, carton_price, line_order
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    RETURNING *
    `,
    [
      productId,
      name,
      category,
      item.quantity,
      item.buyingPrice,
      supplier.id,
      supplier.name,
      receivedAt,
      invoiceNo,
      item.productionDate,
      item.expiryDate,
      batchMeta.paymentStatus,
      batchMeta.advanceAmount,
      item.cartonQuantity ?? null,
      item.cartonPrice ?? null,
      lineOrder,
    ],
  );
  return mapRow(stockInRows[0]);
}

async function resolveStockInLineProducts(
  client: import("pg").PoolClient,
  items: StockInLineInput[],
  mode: "create" | "update",
): Promise<ResolvedStockInLine[]> {
  const resolved: ResolvedStockInLine[] = [];

  for (const item of items) {
    const existing = await findExistingProductForStockInLine(client, item);
    if (existing) {
      resolved.push({
        item,
        productId: existing.id as string,
        isNewProduct: false,
      });
      continue;
    }

    const initialQuantity = mode === "create" ? item.quantity : 0;
    const productId = await createProductForStockInLine(client, item, initialQuantity);
    resolved.push({
      item,
      productId,
      isNewProduct: true,
    });
  }

  return resolved;
}

async function applyStockInQuantityDeltas(
  client: import("pg").PoolClient,
  oldRows: Record<string, unknown>[],
  resolvedLines: ResolvedStockInLine[],
): Promise<void> {
  const oldEntries = oldRows.map((row) => ({
    productId: row.product_id as string,
    quantity: Number(row.quantity),
    productName: row.product_name as string,
  }));
  const newEntries = resolvedLines.map((line) => ({
    productId: line.productId,
    quantity: line.item.quantity,
    productName: line.item.productName.trim(),
  }));

  const deltas = computeStockInQuantityDeltas(oldEntries, newEntries);

  for (const [productId, { delta, productName }] of deltas) {
    const { rows: prodRows } = await client.query(
      `SELECT quantity FROM products WHERE id = $1 FOR UPDATE`,
      [productId],
    );
    if (!prodRows[0]) {
      throw new Error(`Product not found for ${productName}`);
    }

    const currentQty = Number(prodRows[0].quantity);
    const nextQty = currentQty + delta;
    if (nextQty < 0) {
      throw new Error(
        `Cannot reduce stock-in for ${productName}: units already sold or removed`,
      );
    }

    await client.query(`UPDATE products SET quantity = $2, updated_at = NOW() WHERE id = $1`, [
      productId,
      nextQty,
    ]);
  }
}

async function replaceStockInBatchLines(
  client: import("pg").PoolClient,
  supplier: { id: string; name: string },
  receivedAt: Date,
  invoiceNo: number,
  items: StockInLineInput[],
  oldRows: Record<string, unknown>[],
  batchMeta: { paymentStatus: PaymentStatus; advanceAmount: number },
): Promise<StockIn[]> {
  const resolvedLines = await resolveStockInLineProducts(client, items, "update");

  await applyStockInQuantityDeltas(client, oldRows, resolvedLines);

  for (const line of resolvedLines) {
    await updateProductMetadataForStockInLine(client, line.productId, line.item);
  }

  await client.query(`DELETE FROM stock_ins WHERE invoice_no = $1`, [invoiceNo]);

  const stockIns: StockIn[] = [];
  for (let lineOrder = 0; lineOrder < resolvedLines.length; lineOrder++) {
    const line = resolvedLines[lineOrder];
    stockIns.push(
      await insertStockInRecord(
        client,
        supplier,
        receivedAt,
        invoiceNo,
        lineOrder,
        line.productId,
        line.item,
        batchMeta,
      ),
    );
  }

  return stockIns;
}

async function insertStockInBatchLines(
  client: import("pg").PoolClient,
  supplier: { id: string; name: string },
  receivedAt: Date,
  invoiceNo: number,
  items: StockInLineInput[],
  batchMeta: { paymentStatus: PaymentStatus; advanceAmount: number },
): Promise<StockIn[]> {
  const resolvedLines = await resolveStockInLineProducts(client, items, "create");
  const stockIns: StockIn[] = [];

  for (let lineOrder = 0; lineOrder < resolvedLines.length; lineOrder++) {
    const line = resolvedLines[lineOrder];
    if (!line.isNewProduct) {
      await client.query(
        `
        UPDATE products
        SET quantity = quantity + $2,
            buying_price = $3,
            production_date = $4,
            expiry_date = $5,
            updated_at = NOW()
        WHERE id = $1
        `,
        [
          line.productId,
          line.item.quantity,
          line.item.buyingPrice,
          line.item.productionDate,
          line.item.expiryDate,
        ],
      );
    } else {
      await updateProductMetadataForStockInLine(client, line.productId, line.item);
    }

    stockIns.push(
      await insertStockInRecord(
        client,
        supplier,
        receivedAt,
        invoiceNo,
        lineOrder,
        line.productId,
        line.item,
        batchMeta,
      ),
    );
  }

  return stockIns;
}

export async function getStockInBatchByInvoiceNo(invoiceNo: number): Promise<StockIn[]> {
  const { rows } = await pool.query(
    `SELECT * FROM stock_ins WHERE invoice_no = $1 ORDER BY line_order ASC, created_at ASC`,
    [invoiceNo],
  );
  return rows.map(mapRow);
}

export async function updateStockInBatch(
  invoiceNo: number,
  input: CreateStockInBatchInput,
): Promise<{ invoiceNo: number; stockIns: StockIn[] }> {
  validateStockInBatchInput(input);

  const supplier = await getSupplierById(input.supplierId);
  if (!supplier) throw new Error("Supplier not found");

  const receivedAt = input.receivedAt ? new Date(input.receivedAt) : new Date();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: oldRows } = await client.query(
      `SELECT * FROM stock_ins WHERE invoice_no = $1 ORDER BY line_order ASC FOR UPDATE`,
      [invoiceNo],
    );
    if (oldRows.length === 0) throw new Error("Stock-in invoice not found");

    const batchMeta = resolveStockInBatchMeta(input);
    const stockIns = await replaceStockInBatchLines(
      client,
      supplier,
      receivedAt,
      invoiceNo,
      input.items,
      oldRows,
      batchMeta,
    );

    await client.query("COMMIT");
    return { invoiceNo, stockIns };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function createStockIn(input: CreateStockInInput): Promise<StockIn> {
  const supplier = await getSupplierById(input.supplierId);
  if (!supplier) throw new Error("Supplier not found");

  const name = input.productName.trim();
  const category = input.productCategory.trim();
  const quantity = input.quantity;
  const buyingPrice = input.buyingPrice;
  const receivedAt = input.receivedAt ? new Date(input.receivedAt) : new Date();

  if (quantity <= 0) throw new Error("Quantity must be greater than zero");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: existingRows } = await client.query(
      `
      SELECT * FROM products
      WHERE LOWER(name) = LOWER($1) AND LOWER(category) = LOWER($2)
      FOR UPDATE
      `,
      [name, category],
    );

    let productId: string;

    if (existingRows[0]) {
      productId = existingRows[0].id as string;
      await client.query(
        `
        UPDATE products
        SET quantity = quantity + $2,
            buying_price = $3,
            updated_at = NOW()
        WHERE id = $1
        `,
        [productId, quantity, buyingPrice],
      );
    } else {
      const { rows: newRows } = await client.query(
        `
        INSERT INTO products (
          name, category, barcode, buying_price, selling_price, quantity, threshold_limit
        )
        VALUES ($1, $2, $3, $4, NULL, $5, NULL)
        RETURNING id
        `,
        [name, category, generateBarcode(), buyingPrice, quantity],
      );
      productId = newRows[0].id as string;
    }

    const invoiceNo = await allocateStockInInvoiceNo(client);

    const { rows: stockInRows } = await client.query(
      `
      INSERT INTO stock_ins (
        product_id, product_name, product_category, quantity, buying_price,
        supplier_id, supplier_name, received_at, invoice_no
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
      `,
      [
        productId,
        name,
        category,
        quantity,
        buyingPrice,
        supplier.id,
        supplier.name,
        receivedAt,
        invoiceNo,
      ],
    );
    await client.query("COMMIT");
    return mapRow(stockInRows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function createStockInBatch(
  input: CreateStockInBatchInput,
): Promise<{ invoiceNo: number; stockIns: StockIn[] }> {
  validateStockInBatchInput(input);

  const supplier = await getSupplierById(input.supplierId);
  if (!supplier) throw new Error("Supplier not found");

  const receivedAt = input.receivedAt ? new Date(input.receivedAt) : new Date();

  const existing = await findExistingBatch(supplier.id, receivedAt, input.items);
  if (existing) return existing;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const invoiceNo = await allocateStockInInvoiceNo(client);
    const batchMeta = resolveStockInBatchMeta(input);
    const stockIns = await insertStockInBatchLines(
      client,
      supplier,
      receivedAt,
      invoiceNo,
      input.items,
      batchMeta,
    );

    await client.query("COMMIT");
    return { invoiceNo, stockIns };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function listStockIns(
  limit?: number,
  filters: StockInFilters = {},
): Promise<StockIn[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (filters.paymentStatus) {
    conditions.push(`payment_status = $${idx++}`);
    params.push(filters.paymentStatus);
  }

  if (filters.supplier?.trim()) {
    conditions.push(`supplier_name ILIKE $${idx++}`);
    params.push(`%${filters.supplier.trim()}%`);
  }

  if (filters.product?.trim()) {
    conditions.push(`product_name ILIKE $${idx++}`);
    params.push(`%${filters.product.trim()}%`);
  }

  if (filters.dateFrom) {
    conditions.push(`received_at >= $${idx++}::date`);
    params.push(filters.dateFrom);
  }

  if (filters.dateTo) {
    conditions.push(`received_at < ($${idx++}::date + interval '1 day')`);
    params.push(filters.dateTo);
  }

  if (filters.timeFrom) {
    conditions.push(`received_at::time >= $${idx++}::time`);
    params.push(filters.timeFrom);
  }

  if (filters.timeTo) {
    conditions.push(`received_at::time <= $${idx++}::time`);
    params.push(filters.timeTo);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const orderLimit = limit
    ? `ORDER BY created_at DESC LIMIT $${idx++}`
    : `ORDER BY received_at DESC, invoice_no DESC, line_order ASC`;

  if (limit) params.push(limit);

  const { rows } = await pool.query(
    `SELECT * FROM stock_ins ${where} ${orderLimit}`,
    params,
  );
  return rows.map(mapRow);
}

async function findExistingBatch(
  supplierId: string,
  receivedAt: Date,
  items: StockInLineInput[],
): Promise<{ invoiceNo: number; stockIns: StockIn[] } | null> {
  const { rows } = await pool.query(
    `SELECT DISTINCT invoice_no FROM stock_ins WHERE supplier_id = $1 AND received_at = $2`,
    [supplierId, receivedAt],
  );

  for (const row of rows) {
    const invoiceNo = Number(row.invoice_no);
    const { rows: lineRows } = await pool.query(
      `SELECT * FROM stock_ins WHERE invoice_no = $1 ORDER BY line_order ASC, created_at ASC`,
      [invoiceNo],
    );
    const stockIns = lineRows.map(mapRow);
    if (batchItemsMatch(stockIns, items)) {
      return { invoiceNo, stockIns };
    }
  }

  return null;
}

export async function listRecentStockIns(limit = 20): Promise<StockIn[]> {
  return listStockIns(limit);
}

export async function updateStockInPaymentStatus(
  id: string,
  paymentStatus: PaymentStatus,
): Promise<StockIn | null> {
  const { rows: targetRows } = await pool.query(
    `SELECT invoice_no FROM stock_ins WHERE id = $1`,
    [id],
  );
  if (!targetRows[0]) return null;

  const invoiceNo = Number(targetRows[0].invoice_no);
  const { rows } = await pool.query(
    `
    UPDATE stock_ins
    SET payment_status = $2
    WHERE invoice_no = $1
    RETURNING *
    `,
    [invoiceNo, paymentStatus],
  );
  const updated = rows.find((row) => row.id === id);
  return updated ? mapRow(updated) : rows[0] ? mapRow(rows[0]) : null;
}
