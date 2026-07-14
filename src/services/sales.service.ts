import { pool } from "../db/pool.js";
import {
  allocateAdvanceFifo,
  type AdvanceAllocation,
} from "../lib/apply-advance.js";
import { roundMoney, saleLineTotal, validateAdvanceAmount } from "../lib/money.js";
import { type PaymentStatus } from "../lib/payment-status.js";
import { getConsumerById } from "./consumers.service.js";
import { allocateSalesInvoiceNo } from "./invoice-no.service.js";
import { aggregateSaleItems, validateSaleQuantity } from "./sales.validation.js";

export type { PaymentStatus };

export type SaleItem = {
  id: string;
  productId: string | null;
  productName: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  lineTotal: number;
  cartonQuantity: number | null;
  cartonPrice: number | null;
  paymentStatus: PaymentStatus;
};

export type Sale = {
  id: string;
  invoiceNo: number;
  supplierName: string;
  saleAt: string;
  totalAmount: number;
  advanceAmount: number;
  paymentStatus: PaymentStatus;
  items: SaleItem[];
  createdAt: string;
  deletedAt: string | null;
};

export type SaleItemInput = {
  productId: string;
  quantity: number;
  unitPrice?: number;
  cartonQuantity?: number | null;
  cartonPrice?: number | null;
  paymentStatus?: PaymentStatus;
};

export type CreateSaleInput = {
  supplierName: string;
  saleAt?: string;
  paymentStatus?: PaymentStatus;
  advanceAmount?: number;
  items: SaleItemInput[];
};

export type SaleFilters = {
  search?: string;
  supplier?: string;
  period?: string;
  year?: number;
  paymentStatus?: PaymentStatus;
};

function mapSaleItem(row: Record<string, unknown>): SaleItem {
  const unitCost =
    row.unit_cost === null || row.unit_cost === undefined
      ? 0
      : Number(row.unit_cost);
  return {
    id: row.id as string,
    productId: (row.product_id as string) ?? null,
    productName: row.product_name as string,
    quantity: Number(row.quantity),
    unitPrice: Number(row.unit_price),
    unitCost,
    lineTotal: Number(row.line_total),
    cartonQuantity:
      row.carton_quantity === null || row.carton_quantity === undefined
        ? null
        : Number(row.carton_quantity),
    cartonPrice:
      row.carton_price === null || row.carton_price === undefined
        ? null
        : Number(row.carton_price),
    paymentStatus: row.payment_status as PaymentStatus,
  };
}

function mapSale(row: Record<string, unknown>, items: SaleItem[]): Sale {
  return {
    id: row.id as string,
    invoiceNo: Number(row.invoice_no),
    supplierName: row.supplier_name as string,
    saleAt: (row.sale_at as Date).toISOString(),
    totalAmount: Number(row.total_amount),
    advanceAmount: Number(row.advance_amount ?? 0),
    paymentStatus: row.payment_status as PaymentStatus,
    items,
    createdAt: (row.created_at as Date).toISOString(),
    deletedAt: row.deleted_at ? (row.deleted_at as Date).toISOString() : null,
  };
}

function periodToRange(period: string, year: number): { from: Date; to: Date } | null {
  const now = new Date();
  const y = year || now.getFullYear();

  if (period === "today") {
    const from = new Date(now);
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + 1);
    return { from, to };
  }

  if (period === "this_year") {
    return {
      from: new Date(y, 0, 1),
      to: new Date(y + 1, 0, 1),
    };
  }

  if (period === "this_week") {
    const from = new Date(now);
    const day = from.getDay();
    const diff = day === 0 ? 6 : day - 1;
    from.setDate(from.getDate() - diff);
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + 7);
    return { from, to };
  }

  if (period === "this_month") {
    return {
      from: new Date(y, now.getMonth(), 1),
      to: new Date(y, now.getMonth() + 1, 1),
    };
  }

  if (period === "last_month") {
    return {
      from: new Date(y, now.getMonth() - 1, 1),
      to: new Date(y, now.getMonth(), 1),
    };
  }

  const monthMatch = period.match(/^month-(\d{1,2})$/);
  if (monthMatch) {
    const month = Number(monthMatch[1]) - 1;
    if (month < 0 || month > 11) return null;
    return {
      from: new Date(y, month, 1),
      to: new Date(y, month + 1, 1),
    };
  }

  return null;
}

async function fetchSalesByIds(ids: string[], options: { includeDeleted?: boolean } = {}): Promise<Sale[]> {
  if (ids.length === 0) return [];

  const includeDeleted = options.includeDeleted === true;
  const { rows: saleRows } = await pool.query(
    includeDeleted
      ? `SELECT * FROM sales WHERE id = ANY($1::uuid[]) ORDER BY sale_at DESC`
      : `SELECT * FROM sales WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL ORDER BY sale_at DESC`,
    [ids],
  );

  const { rows: itemRows } = await pool.query(
    `SELECT * FROM sale_items WHERE sale_id = ANY($1::uuid[]) ORDER BY line_order ASC, id ASC`,
    [ids],
  );

  const itemsBySale = new Map<string, SaleItem[]>();
  for (const row of itemRows) {
    const saleId = row.sale_id as string;
    const list = itemsBySale.get(saleId) ?? [];
    list.push(mapSaleItem(row));
    itemsBySale.set(saleId, list);
  }

  return saleRows.map((row) => mapSale(row, itemsBySale.get(row.id as string) ?? []));
}

export async function getSaleById(id: string): Promise<Sale | null> {
  const sales = await fetchSalesByIds([id]);
  return sales[0] ?? null;
}

export async function updateSale(id: string, input: CreateSaleInput): Promise<Sale> {
  if (input.items.length === 0) {
    throw new Error("At least one product is required");
  }

  const aggregatedItems = aggregateSaleItems(
    input.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      cartonQuantity: item.cartonQuantity ?? null,
      cartonPrice: item.cartonPrice ?? null,
    })),
  );

  const salePaymentStatus = input.paymentStatus ?? "pending";
  const advanceAmount = roundMoney(input.advanceAmount ?? 0);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: saleRows } = await client.query(
      `SELECT * FROM sales WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [id],
    );
    const existingSale = saleRows[0];
    if (!existingSale) throw new Error("Sale not found");

    const { rows: oldItemRows } = await client.query(
      `SELECT * FROM sale_items WHERE sale_id = $1 FOR UPDATE`,
      [id],
    );

    for (const oldItem of oldItemRows) {
      if (!oldItem.product_id) continue;
      await client.query(
        `UPDATE products SET quantity = quantity + $2, updated_at = NOW() WHERE id = $1`,
        [oldItem.product_id, oldItem.quantity],
      );
    }

    await client.query(`DELETE FROM sale_items WHERE sale_id = $1`, [id]);

    const saleAt = input.saleAt ? new Date(input.saleAt) : new Date(existingSale.sale_at);
    let totalAmount = 0;
    const preparedItems: {
      productId: string;
      productName: string;
      quantity: number;
      unitPrice: number;
      unitCost: number;
      lineTotal: number;
      cartonQuantity: number | null;
      cartonPrice: number | null;
      lineOrder: number;
    }[] = [];

    for (let lineOrder = 0; lineOrder < aggregatedItems.length; lineOrder++) {
      const item = aggregatedItems[lineOrder];
      const { rows } = await client.query(
        `SELECT id, name, quantity, selling_price, buying_price FROM products WHERE id = $1 FOR UPDATE`,
        [item.productId],
      );
      const product = rows[0];
      if (!product) throw new Error("Product not found");
      if (product.selling_price == null) {
        throw new Error(`Selling price not set for ${product.name}. Update it on the Products page.`);
      }

      const available = Number(product.quantity);
      validateSaleQuantity(product.name as string, available, item.quantity);

      const unitPrice =
        item.unitPrice != null && item.unitPrice >= 0
          ? item.unitPrice
          : Number(product.selling_price);
      const unitCost = Number(product.buying_price);
      const lineTotal = saleLineTotal(item.quantity, unitPrice);
      totalAmount = roundMoney(totalAmount + lineTotal);

      preparedItems.push({
        productId: product.id as string,
        productName: product.name as string,
        quantity: item.quantity,
        unitPrice,
        unitCost,
        lineTotal,
        cartonQuantity: item.cartonQuantity,
        cartonPrice: item.cartonPrice,
        lineOrder,
      });
    }

    validateAdvanceAmount(advanceAmount, totalAmount);

    const { rows: updatedSaleRows } = await client.query(
      `
      UPDATE sales
      SET supplier_name = $2, sale_at = $3, total_amount = $4, payment_status = $5, advance_amount = $6
      WHERE id = $1
      RETURNING *
      `,
      [id, input.supplierName.trim(), saleAt, totalAmount, salePaymentStatus, advanceAmount],
    );
    const sale = updatedSaleRows[0];

    const items: SaleItem[] = [];
    for (const item of preparedItems) {
      await client.query(
        `UPDATE products SET quantity = quantity - $2, updated_at = NOW() WHERE id = $1`,
        [item.productId, item.quantity],
      );

      const { rows: itemRows } = await client.query(
        `
        INSERT INTO sale_items (
          sale_id, product_id, product_name, quantity, unit_price, unit_cost, line_total,
          payment_status, carton_quantity, carton_price, line_order
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
        `,
        [
          sale.id,
          item.productId,
          item.productName,
          item.quantity,
          item.unitPrice,
          item.unitCost,
          item.lineTotal,
          salePaymentStatus,
          item.cartonQuantity,
          item.cartonPrice,
          item.lineOrder,
        ],
      );
      items.push(mapSaleItem(itemRows[0]));
    }

    await client.query("COMMIT");
    return mapSale(sale, items);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function createSale(input: CreateSaleInput): Promise<Sale> {
  if (input.items.length === 0) {
    throw new Error("At least one product is required");
  }

  const aggregatedItems = aggregateSaleItems(
    input.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      cartonQuantity: item.cartonQuantity ?? null,
      cartonPrice: item.cartonPrice ?? null,
    })),
  );

  const salePaymentStatus = input.paymentStatus ?? "pending";
  const advanceAmount = roundMoney(input.advanceAmount ?? 0);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const saleAt = input.saleAt ? new Date(input.saleAt) : new Date();
    let totalAmount = 0;
    const preparedItems: {
      productId: string;
      productName: string;
      quantity: number;
      unitPrice: number;
      unitCost: number;
      lineTotal: number;
      cartonQuantity: number | null;
      cartonPrice: number | null;
      lineOrder: number;
    }[] = [];

    for (let lineOrder = 0; lineOrder < aggregatedItems.length; lineOrder++) {
      const item = aggregatedItems[lineOrder];
      const { rows } = await client.query(
        `SELECT id, name, quantity, selling_price, buying_price FROM products WHERE id = $1 FOR UPDATE`,
        [item.productId],
      );
      const product = rows[0];
      if (!product) throw new Error("Product not found");
      if (product.selling_price == null) {
        throw new Error(`Selling price not set for ${product.name}. Update it on the Products page.`);
      }

      const available = Number(product.quantity);
      validateSaleQuantity(product.name as string, available, item.quantity);

      const unitPrice =
        item.unitPrice != null && item.unitPrice >= 0
          ? item.unitPrice
          : Number(product.selling_price);
      const unitCost = Number(product.buying_price);
      const lineTotal = saleLineTotal(item.quantity, unitPrice);
      totalAmount = roundMoney(totalAmount + lineTotal);

      preparedItems.push({
        productId: product.id as string,
        productName: product.name as string,
        quantity: item.quantity,
        unitPrice,
        unitCost,
        lineTotal,
        cartonQuantity: item.cartonQuantity,
        cartonPrice: item.cartonPrice,
        lineOrder,
      });
    }

    validateAdvanceAmount(advanceAmount, totalAmount);

    const invoiceNo = await allocateSalesInvoiceNo(client);

    const { rows: saleRows } = await client.query(
      `
      INSERT INTO sales (supplier_name, sale_at, total_amount, invoice_no, payment_status, advance_amount)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
      `,
      [input.supplierName.trim(), saleAt, totalAmount, invoiceNo, salePaymentStatus, advanceAmount],
    );
    const sale = saleRows[0];

    const items: SaleItem[] = [];
    for (const item of preparedItems) {
      await client.query(
        `UPDATE products SET quantity = quantity - $2, updated_at = NOW() WHERE id = $1`,
        [item.productId, item.quantity],
      );

      const { rows: itemRows } = await client.query(
        `
        INSERT INTO sale_items (
          sale_id, product_id, product_name, quantity, unit_price, unit_cost, line_total,
          payment_status, carton_quantity, carton_price, line_order
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
        `,
        [
          sale.id,
          item.productId,
          item.productName,
          item.quantity,
          item.unitPrice,
          item.unitCost,
          item.lineTotal,
          salePaymentStatus,
          item.cartonQuantity,
          item.cartonPrice,
          item.lineOrder,
        ],
      );
      items.push(mapSaleItem(itemRows[0]));
    }

    await client.query("COMMIT");
    return mapSale(sale, items);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function listRecentSales(limit = 20): Promise<Sale[]> {
  const { rows } = await pool.query(
    `SELECT id FROM sales WHERE deleted_at IS NULL ORDER BY sale_at DESC LIMIT $1`,
    [limit],
  );
  return fetchSalesByIds(rows.map((r) => r.id as string));
}

export async function listSales(filters: SaleFilters = {}): Promise<Sale[]> {
  const conditions: string[] = [`s.deleted_at IS NULL`];
  const params: unknown[] = [];
  let idx = 1;

  if (filters.supplier?.trim()) {
    conditions.push(`s.supplier_name ILIKE $${idx++}`);
    params.push(`%${filters.supplier.trim()}%`);
  }

  if (filters.search?.trim()) {
    conditions.push(
      `(s.supplier_name ILIKE $${idx} OR EXISTS (
        SELECT 1 FROM sale_items si
        WHERE si.sale_id = s.id AND si.product_name ILIKE $${idx}
      ))`,
    );
    params.push(`%${filters.search.trim()}%`);
    idx++;
  }

  if (filters.period) {
    const range = periodToRange(filters.period, filters.year ?? new Date().getFullYear());
    if (range) {
      conditions.push(`s.sale_at >= $${idx++} AND s.sale_at < $${idx++}`);
      params.push(range.from.toISOString(), range.to.toISOString());
    }
  }

  if (filters.paymentStatus) {
    conditions.push(`s.payment_status = $${idx++}`);
    params.push(filters.paymentStatus);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await pool.query(
    `SELECT s.id FROM sales s ${where} ORDER BY s.sale_at DESC`,
    params,
  );

  return fetchSalesByIds(rows.map((r) => r.id as string));
}

export async function getSalesSummary(filters: SaleFilters = {}) {
  const sales = await listSales(filters);
  const totalAmount = sales.reduce((sum, s) => sum + s.totalAmount, 0);
  const totalItems = sales.reduce(
    (sum, s) => sum + s.items.reduce((n, i) => n + i.quantity, 0),
    0,
  );
  const grossProfit = sales.reduce(
    (sum, s) =>
      sum +
      s.items.reduce((lineSum, item) => lineSum + (item.lineTotal - item.unitCost * item.quantity), 0),
    0,
  );
  return {
    transactionCount: sales.length,
    totalAmount,
    totalItems,
    grossProfit,
  };
}

export async function updateSalePaymentStatus(
  id: string,
  paymentStatus: PaymentStatus,
): Promise<Sale | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `
      UPDATE sales
      SET payment_status = $2
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *
      `,
      [id, paymentStatus],
    );
    if (!rows[0]) {
      await client.query("ROLLBACK");
      return null;
    }

    await client.query(
      `UPDATE sale_items SET payment_status = $2 WHERE sale_id = $1`,
      [id, paymentStatus],
    );

    await client.query("COMMIT");
    const sales = await fetchSalesByIds([id]);
    return sales[0] ?? null;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export type ApplyAdvanceResult = {
  partyName: string;
  amount: number;
  appliedTotal: number;
  remainder: number;
  allocations: AdvanceAllocation[];
  sales: Sale[];
};

/** Apply a payment to a consumer's earliest unpaid sales invoices (FIFO). */
export async function applyAdvanceToConsumer(
  consumerId: string,
  amount: number,
): Promise<ApplyAdvanceResult> {
  const payment = roundMoney(amount);
  if (!Number.isFinite(payment) || payment <= 0) {
    throw new Error("Advance amount must be greater than zero");
  }

  const consumer = await getConsumerById(consumerId);
  if (!consumer) {
    throw new Error("Consumer not found");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `
      SELECT id, invoice_no, total_amount, advance_amount, payment_status
      FROM sales
      WHERE supplier_name = $1
        AND deleted_at IS NULL
        AND payment_status IN ('pending', 'half_paid')
      ORDER BY sale_at ASC, invoice_no ASC
      FOR UPDATE
      `,
      [consumer.name],
    );

    const pending = rows.map((row) => ({
      id: row.id as string,
      invoiceNo: Number(row.invoice_no),
      total: Number(row.total_amount),
      advanceAmount: Number(row.advance_amount ?? 0),
      paymentStatus: row.payment_status as PaymentStatus,
    }));

    const { allocations, remainder, appliedTotal } = allocateAdvanceFifo(pending, payment);

    if (allocations.length === 0) {
      throw new Error("No unpaid invoices found for this consumer");
    }

    for (const allocation of allocations) {
      await client.query(
        `
        UPDATE sales
        SET advance_amount = $2, payment_status = $3
        WHERE id = $1
        `,
        [allocation.id, allocation.newAdvance, allocation.newStatus],
      );
      await client.query(
        `UPDATE sale_items SET payment_status = $2 WHERE sale_id = $1`,
        [allocation.id, allocation.newStatus],
      );
    }

    await client.query("COMMIT");

    const sales = await fetchSalesByIds(allocations.map((a) => a.id));
    return {
      partyName: consumer.name,
      amount: payment,
      appliedTotal,
      remainder,
      allocations,
      sales,
    };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Transaction may already be closed.
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Hide a stock-out invoice from the website without removing the DB row.
 * Restores product quantities so inventory matches the corrected history.
 */
export async function softDeleteSale(id: string): Promise<Sale> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: saleRows } = await client.query(
      `SELECT * FROM sales WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [id],
    );
    const existingSale = saleRows[0];
    if (!existingSale) {
      throw new Error("Sale not found");
    }

    const { rows: itemRows } = await client.query(
      `SELECT * FROM sale_items WHERE sale_id = $1 FOR UPDATE`,
      [id],
    );

    for (const item of itemRows) {
      if (!item.product_id) continue;
      await client.query(
        `UPDATE products SET quantity = quantity + $2, updated_at = NOW() WHERE id = $1`,
        [item.product_id, item.quantity],
      );
    }

    const { rows: updatedRows } = await client.query(
      `
      UPDATE sales
      SET deleted_at = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [id],
    );

    await client.query("COMMIT");

    const deleted = mapSale(updatedRows[0], itemRows.map(mapSaleItem));
    return deleted;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Transaction may already be closed.
    }
    throw err;
  } finally {
    client.release();
  }
}
