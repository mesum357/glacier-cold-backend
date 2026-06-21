import { pool } from "../db/pool.js";
import { allocateInvoiceNo } from "./invoice-no.service.js";
import { aggregateSaleItems, validateSaleQuantity } from "./sales.validation.js";

export type SaleItem = {
  id: string;
  productId: string | null;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type Sale = {
  id: string;
  invoiceNo: number;
  supplierName: string;
  saleAt: string;
  totalAmount: number;
  items: SaleItem[];
  createdAt: string;
};

export type SaleItemInput = {
  productId: string;
  quantity: number;
};

export type CreateSaleInput = {
  supplierName: string;
  saleAt?: string;
  items: SaleItemInput[];
};

export type SaleFilters = {
  search?: string;
  supplier?: string;
  period?: string;
  year?: number;
};

function mapSaleItem(row: Record<string, unknown>): SaleItem {
  return {
    id: row.id as string,
    productId: (row.product_id as string) ?? null,
    productName: row.product_name as string,
    quantity: Number(row.quantity),
    unitPrice: Number(row.unit_price),
    lineTotal: Number(row.line_total),
  };
}

function mapSale(row: Record<string, unknown>, items: SaleItem[]): Sale {
  return {
    id: row.id as string,
    invoiceNo: Number(row.invoice_no),
    supplierName: row.supplier_name as string,
    saleAt: (row.sale_at as Date).toISOString(),
    totalAmount: Number(row.total_amount),
    items,
    createdAt: (row.created_at as Date).toISOString(),
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

async function fetchSalesByIds(ids: string[]): Promise<Sale[]> {
  if (ids.length === 0) return [];

  const { rows: saleRows } = await pool.query(
    `SELECT * FROM sales WHERE id = ANY($1::uuid[]) ORDER BY sale_at DESC`,
    [ids],
  );

  const { rows: itemRows } = await pool.query(
    `SELECT * FROM sale_items WHERE sale_id = ANY($1::uuid[]) ORDER BY product_name`,
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

export async function createSale(input: CreateSaleInput): Promise<Sale> {
  if (input.items.length === 0) {
    throw new Error("At least one product is required");
  }

  const aggregatedItems = aggregateSaleItems(input.items);

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
      lineTotal: number;
    }[] = [];

    for (const item of aggregatedItems) {
      const { rows } = await client.query(
        `SELECT id, name, quantity, selling_price FROM products WHERE id = $1 FOR UPDATE`,
        [item.productId],
      );
      const product = rows[0];
      if (!product) throw new Error("Product not found");
      if (product.selling_price == null) {
        throw new Error(`Selling price not set for ${product.name}. Update it on the Products page.`);
      }

      const available = Number(product.quantity);
      validateSaleQuantity(product.name as string, available, item.quantity);

      const unitPrice = Number(product.selling_price);
      const lineTotal = unitPrice * item.quantity;
      totalAmount += lineTotal;

      preparedItems.push({
        productId: product.id as string,
        productName: product.name as string,
        quantity: item.quantity,
        unitPrice,
        lineTotal,
      });
    }

    const invoiceNo = await allocateInvoiceNo(client);

    const { rows: saleRows } = await client.query(
      `
      INSERT INTO sales (supplier_name, sale_at, total_amount, invoice_no)
      VALUES ($1, $2, $3, $4)
      RETURNING *
      `,
      [input.supplierName.trim(), saleAt, totalAmount, invoiceNo],
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
        INSERT INTO sale_items (sale_id, product_id, product_name, quantity, unit_price, line_total)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
        `,
        [sale.id, item.productId, item.productName, item.quantity, item.unitPrice, item.lineTotal],
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
    `SELECT id FROM sales ORDER BY sale_at DESC LIMIT $1`,
    [limit],
  );
  return fetchSalesByIds(rows.map((r) => r.id as string));
}

export async function listSales(filters: SaleFilters = {}): Promise<Sale[]> {
  const conditions: string[] = [];
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
  return {
    transactionCount: sales.length,
    totalAmount,
    totalItems,
  };
}
