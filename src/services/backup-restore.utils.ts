export const SUPPORTED_BACKUP_VERSIONS = [1, 2, 3, 4] as const;

export const DEFAULT_SHOP_CONTACTS =
  "Rizwan Akbar: 0355-5454859\nTauqeer Ahmed: 0311-1028883";

export const DEFAULT_PAYMENT_STATUS = "pending";

export const DATA_TABLES = [
  "shop_settings",
  "admins",
  "suppliers",
  "consumers",
  "products",
  "sales",
  "sale_items",
  "stock_ins",
] as const;

export type DataTable = (typeof DATA_TABLES)[number];

export type BackupTables = Record<DataTable, Record<string, unknown>[]>;

export const TABLE_EXPORT_ORDER: Partial<Record<DataTable, string>> = {
  suppliers: "ORDER BY name, id",
  consumers: "ORDER BY name, id",
  products: "ORDER BY category, name, id",
  sales: "ORDER BY invoice_no, sale_at, id",
  sale_items: "ORDER BY sale_id, line_order, id",
  stock_ins: "ORDER BY invoice_no, line_order, received_at, id",
  shop_settings: "ORDER BY id",
  admins: "ORDER BY email, id",
};

export const INSERT_COLUMNS: Record<
  Exclude<DataTable, "shop_settings" | "admins">,
  string[]
> = {
  suppliers: ["id", "name", "phone", "email", "address", "created_at", "updated_at"],
  consumers: [
    "id",
    "name",
    "phone",
    "email",
    "address",
    "status",
    "created_at",
    "updated_at",
  ],
  products: [
    "id",
    "name",
    "category",
    "barcode",
    "buying_price",
    "selling_price",
    "quantity",
    "threshold_limit",
    "production_date",
    "expiry_date",
    "expiry_alert_days",
    "created_at",
    "updated_at",
  ],
  sales: [
    "id",
    "supplier_name",
    "sale_at",
    "total_amount",
    "created_at",
    "invoice_no",
    "payment_status",
    "advance_amount",
  ],
  sale_items: [
    "id",
    "sale_id",
    "product_id",
    "product_name",
    "quantity",
    "unit_price",
    "line_total",
    "payment_status",
    "unit_cost",
    "carton_quantity",
    "carton_price",
    "line_order",
  ],
  stock_ins: [
    "id",
    "product_id",
    "product_name",
    "product_category",
    "quantity",
    "buying_price",
    "supplier_id",
    "supplier_name",
    "received_at",
    "created_at",
    "invoice_no",
    "production_date",
    "expiry_date",
    "payment_status",
    "advance_amount",
    "carton_quantity",
    "carton_price",
    "line_order",
  ],
};

function rowTimestamp(row: Record<string, unknown>, fields: string[]): number {
  for (const field of fields) {
    const value = row[field];
    if (typeof value === "string") {
      const parsed = Date.parse(value);
      if (!Number.isNaN(parsed)) return parsed;
    }
    if (value instanceof Date) return value.getTime();
  }
  return 0;
}

function rowId(row: Record<string, unknown>): string {
  return String(row.id ?? "");
}

export function assignMissingInvoiceNumbers(
  sales: Record<string, unknown>[],
  stockIns: Record<string, unknown>[],
): {
  sales: Record<string, unknown>[];
  stockIns: Record<string, unknown>[];
  maxSalesInvoiceNo: number;
  maxStockInInvoiceNo: number;
} {
  const salesCopy = sales.map((row) => ({ ...row }));
  const stockInsCopy = stockIns.map((row) => ({ ...row }));

  let maxSalesInvoiceNo = 0;
  for (const row of salesCopy) {
    const invoiceNo = Number(row.invoice_no);
    if (Number.isFinite(invoiceNo) && invoiceNo > maxSalesInvoiceNo) {
      maxSalesInvoiceNo = invoiceNo;
    }
  }

  let maxStockInInvoiceNo = 0;
  for (const row of stockInsCopy) {
    const invoiceNo = Number(row.invoice_no);
    if (Number.isFinite(invoiceNo) && invoiceNo > maxStockInInvoiceNo) {
      maxStockInInvoiceNo = invoiceNo;
    }
  }

  const missingSales: Array<{
    row: Record<string, unknown>;
    sortAt: number;
    sortId: string;
  }> = [];

  for (const row of salesCopy) {
    if (row.invoice_no == null || row.invoice_no === "") {
      missingSales.push({
        row,
        sortAt: rowTimestamp(row, ["sale_at", "created_at"]),
        sortId: rowId(row),
      });
    }
  }

  const missingStockIns: Array<{
    row: Record<string, unknown>;
    sortAt: number;
    sortId: string;
  }> = [];

  for (const row of stockInsCopy) {
    if (row.invoice_no == null || row.invoice_no === "") {
      missingStockIns.push({
        row,
        sortAt: rowTimestamp(row, ["received_at", "created_at"]),
        sortId: rowId(row),
      });
    }
  }

  missingSales.sort((a, b) => a.sortAt - b.sortAt || a.sortId.localeCompare(b.sortId));
  missingStockIns.sort((a, b) => a.sortAt - b.sortAt || a.sortId.localeCompare(b.sortId));

  for (const entry of missingSales) {
    maxSalesInvoiceNo += 1;
    entry.row.invoice_no = maxSalesInvoiceNo;
  }

  for (const entry of missingStockIns) {
    maxStockInInvoiceNo += 1;
    entry.row.invoice_no = maxStockInInvoiceNo;
  }

  return { sales: salesCopy, stockIns: stockInsCopy, maxSalesInvoiceNo, maxStockInInvoiceNo };
}

export function renumberInvoiceNumbersSeparately(
  sales: Record<string, unknown>[],
  stockIns: Record<string, unknown>[],
): {
  sales: Record<string, unknown>[];
  stockIns: Record<string, unknown>[];
  maxSalesInvoiceNo: number;
  maxStockInInvoiceNo: number;
} {
  const salesCopy = sales.map((row) => ({ ...row }));
  const stockInsCopy = stockIns.map((row) => ({ ...row }));

  salesCopy.sort(
    (a, b) =>
      rowTimestamp(a, ["sale_at", "created_at"]) - rowTimestamp(b, ["sale_at", "created_at"]) ||
      rowId(a).localeCompare(rowId(b)),
  );

  const salesByOldNo = new Map<number, Record<string, unknown>>();
  for (const row of salesCopy) {
    const oldNo = Number(row.invoice_no);
    if (Number.isFinite(oldNo)) {
      salesByOldNo.set(oldNo, row);
    }
  }

  const orderedSales = [...salesByOldNo.entries()].sort(
    (a, b) =>
      rowTimestamp(a[1], ["sale_at", "created_at"]) - rowTimestamp(b[1], ["sale_at", "created_at"]) ||
      a[0] - b[0],
  );

  const salesNoMap = new Map<number, number>();
  orderedSales.forEach(([oldNo], index) => {
    salesNoMap.set(oldNo, index + 1);
  });

  for (const row of salesCopy) {
    const oldNo = Number(row.invoice_no);
    const newNo = salesNoMap.get(oldNo);
    if (newNo != null) {
      row.invoice_no = newNo;
    }
  }

  const stockInBatches = new Map<number, Record<string, unknown>[]>();
  for (const row of stockInsCopy) {
    const oldNo = Number(row.invoice_no);
    if (!Number.isFinite(oldNo)) continue;
    const batch = stockInBatches.get(oldNo) ?? [];
    batch.push(row);
    stockInBatches.set(oldNo, batch);
  }

  const orderedBatches = [...stockInBatches.entries()].sort((a, b) => {
    const aAt = Math.min(...a[1].map((row) => rowTimestamp(row, ["received_at", "created_at"])));
    const bAt = Math.min(...b[1].map((row) => rowTimestamp(row, ["received_at", "created_at"])));
    return aAt - bAt || a[0] - b[0];
  });

  orderedBatches.forEach(([oldNo], index) => {
    const newNo = index + 1;
    for (const row of stockInBatches.get(oldNo) ?? []) {
      row.invoice_no = newNo;
    }
  });

  let maxSalesInvoiceNo = 0;
  for (const row of salesCopy) {
    const invoiceNo = Number(row.invoice_no);
    if (Number.isFinite(invoiceNo) && invoiceNo > maxSalesInvoiceNo) {
      maxSalesInvoiceNo = invoiceNo;
    }
  }

  let maxStockInInvoiceNo = 0;
  for (const row of stockInsCopy) {
    const invoiceNo = Number(row.invoice_no);
    if (Number.isFinite(invoiceNo) && invoiceNo > maxStockInInvoiceNo) {
      maxStockInInvoiceNo = invoiceNo;
    }
  }

  return { sales: salesCopy, stockIns: stockInsCopy, maxSalesInvoiceNo, maxStockInInvoiceNo };
}

export function assignLineOrder(
  rows: Record<string, unknown>[],
  groupKey: string,
): Record<string, unknown>[] {
  const copy = rows.map((row) => ({ ...row }));
  const groups = new Map<string, Record<string, unknown>[]>();

  for (const row of copy) {
    const key = String(row[groupKey] ?? "");
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  for (const group of groups.values()) {
    group.sort(
      (a, b) =>
        Number(a.line_order ?? Number.NaN) - Number(b.line_order ?? Number.NaN) ||
        rowTimestamp(a, ["created_at", "received_at", "sale_at"]) -
          rowTimestamp(b, ["created_at", "received_at", "sale_at"]) ||
        rowId(a).localeCompare(rowId(b)),
    );

    group.forEach((row, index) => {
      if (row.line_order == null || row.line_order === "") {
        row.line_order = index;
      }
    });
  }

  return copy;
}

export function backfillSaleItemUnitCost(
  saleItems: Record<string, unknown>[],
  products: Record<string, unknown>[],
): Record<string, unknown>[] {
  const productById = new Map(
    products.map((product) => [String(product.id), product]),
  );
  const productByName = new Map(
    products.map((product) => [String(product.name).toLowerCase(), product]),
  );

  return saleItems.map((row) => {
    const copy = { ...row };
    if (copy.unit_cost != null && copy.unit_cost !== "") return copy;

    const productId = copy.product_id ? String(copy.product_id) : "";
    const byId = productId ? productById.get(productId) : undefined;
    const byName = productByName.get(String(copy.product_name ?? "").toLowerCase());
    const product = byId ?? byName;

    if (product?.buying_price != null) {
      copy.unit_cost = product.buying_price;
    }

    return copy;
  });
}

function withPaymentStatus(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((row) => ({
    ...row,
    payment_status: row.payment_status ?? DEFAULT_PAYMENT_STATUS,
    advance_amount: row.advance_amount ?? 0,
  }));
}

function withNullableCartonFields(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((row) => ({
    ...row,
    carton_quantity: row.carton_quantity ?? null,
    carton_price: row.carton_price ?? null,
  }));
}

function withProductOptionalDates(products: Record<string, unknown>[]): Record<string, unknown>[] {
  return products.map((row) => ({
    ...row,
    production_date: row.production_date ?? null,
    expiry_date: row.expiry_date ?? null,
    expiry_alert_days: row.expiry_alert_days ?? null,
    selling_price: row.selling_price ?? null,
    threshold_limit: row.threshold_limit ?? null,
  }));
}

function withStockInOptionalDates(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((row) => ({
    ...row,
    production_date: row.production_date ?? null,
    expiry_date: row.expiry_date ?? null,
  }));
}

export function normalizeBackupTables(
  tables: Partial<BackupTables>,
  version: number,
): BackupTables {
  const normalized = {} as BackupTables;

  for (const table of DATA_TABLES) {
    const rows = tables[table];
    if (rows === undefined && table === "admins" && version === 1) {
      normalized.admins = [];
      continue;
    }
    if (!Array.isArray(rows)) {
      throw new Error(`Backup file is missing ${table} data`);
    }
    normalized[table] = rows.map((row) => ({ ...row }));
  }

  return normalized;
}

export function prepareTablesForRestore(tables: BackupTables): BackupTables {
  const products = withProductOptionalDates(tables.products);
  const withMissing = assignMissingInvoiceNumbers(tables.sales, tables.stock_ins);
  const invoiceResult = renumberInvoiceNumbersSeparately(withMissing.sales, withMissing.stockIns);

  const sales = withPaymentStatus(invoiceResult.sales);
  const stockIns = withNullableCartonFields(
    withStockInOptionalDates(
      assignLineOrder(withPaymentStatus(invoiceResult.stockIns), "invoice_no"),
    ),
  );

  const saleItems = withNullableCartonFields(
    assignLineOrder(
      backfillSaleItemUnitCost(withPaymentStatus(tables.sale_items), products),
      "sale_id",
    ),
  );

  const shopSettings = tables.shop_settings.map((row) => ({
    ...row,
    contacts: row.contacts ?? DEFAULT_SHOP_CONTACTS,
  }));

  return {
    shop_settings: shopSettings,
    admins: tables.admins,
    suppliers: tables.suppliers,
    consumers: tables.consumers,
    products,
    sales,
    sale_items: saleItems,
    stock_ins: stockIns,
  };
}

export type InvoiceSequences = {
  stockInInvoiceNo: number;
  salesInvoiceNo: number;
};

export function resolveInvoiceSequences(
  preparedTables: BackupTables,
  sequences: {
    stockInInvoiceNo?: unknown;
    salesInvoiceNo?: unknown;
    invoiceNo?: unknown;
  } = {},
): InvoiceSequences {
  const legacyMax = Number(sequences.invoiceNo ?? 0);
  let maxSales = 0;
  let maxStockIn = 0;

  for (const row of preparedTables.sales) {
    const invoiceNo = Number(row.invoice_no ?? 0);
    if (Number.isFinite(invoiceNo) && invoiceNo > maxSales) {
      maxSales = invoiceNo;
    }
  }

  for (const row of preparedTables.stock_ins) {
    const invoiceNo = Number(row.invoice_no ?? 0);
    if (Number.isFinite(invoiceNo) && invoiceNo > maxStockIn) {
      maxStockIn = invoiceNo;
    }
  }

  const stockInFromPayload = Number(sequences.stockInInvoiceNo ?? 0);
  const salesFromPayload = Number(sequences.salesInvoiceNo ?? 0);

  return {
    stockInInvoiceNo: Math.max(maxStockIn, stockInFromPayload, legacyMax),
    salesInvoiceNo: Math.max(maxSales, salesFromPayload, legacyMax),
  };
}

/** @deprecated Use resolveInvoiceSequences */
export function resolveInvoiceSequence(
  preparedTables: BackupTables,
  sequenceFromPayload: unknown,
): number {
  const sequences = resolveInvoiceSequences(preparedTables, { invoiceNo: sequenceFromPayload });
  return Math.max(sequences.stockInInvoiceNo, sequences.salesInvoiceNo);
}

export function buildInsertValues(
  table: Exclude<DataTable, "shop_settings" | "admins">,
  row: Record<string, unknown>,
): unknown[] {
  return INSERT_COLUMNS[table].map((column) => row[column] ?? null);
}
