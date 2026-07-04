import { describe, expect, it } from "vitest";
import {
  assignLineOrder,
  assignMissingInvoiceNumbers,
  backfillSaleItemUnitCost,
  buildInsertValues,
  normalizeBackupTables,
  prepareTablesForRestore,
  resolveInvoiceSequence,
} from "./backup-restore.utils.js";

const baseTables = {
  shop_settings: [{ id: 1, store_name: "Glacier", contacts: "A: 1" }],
  admins: [{ id: "a1", email: "admin@test.com", password_hash: "hash", full_name: "Admin" }],
  suppliers: [{ id: "s1", name: "Supplier", phone: "1", email: "s@test.com", address: "" }],
  consumers: [
    {
      id: "c1",
      name: "Customer",
      phone: "2",
      email: "c@test.com",
      address: "",
      status: "regular",
    },
  ],
  products: [
    {
      id: "p1",
      name: "Milk",
      category: "Dairy",
      barcode: "111",
      buying_price: 50,
      selling_price: 70,
      quantity: 10,
      threshold_limit: 2,
    },
  ],
  sales: [
    {
      id: "sale1",
      supplier_name: "Customer",
      sale_at: "2026-01-01T10:00:00.000Z",
      total_amount: 140,
      created_at: "2026-01-01T10:00:00.000Z",
    },
  ],
  sale_items: [
    {
      id: "si1",
      sale_id: "sale1",
      product_id: "p1",
      product_name: "Milk",
      quantity: 2,
      unit_price: 70,
      line_total: 140,
    },
  ],
  stock_ins: [
    {
      id: "st1",
      product_id: "p1",
      product_name: "Milk",
      product_category: "Dairy",
      quantity: 10,
      buying_price: 50,
      supplier_id: "s1",
      supplier_name: "Supplier",
      received_at: "2026-01-02T10:00:00.000Z",
      created_at: "2026-01-02T10:00:00.000Z",
    },
    {
      id: "st2",
      product_id: "p1",
      product_name: "Milk",
      product_category: "Dairy",
      quantity: 5,
      buying_price: 50,
      supplier_id: "s1",
      supplier_name: "Supplier",
      received_at: "2026-01-02T10:05:00.000Z",
      created_at: "2026-01-02T10:05:00.000Z",
      invoice_no: 4,
    },
  ],
};

describe("assignMissingInvoiceNumbers", () => {
  it("assigns separate sequence numbers when invoice numbers are missing", () => {
    const sales = [
      {
        id: "sale1",
        sale_at: "2026-01-01T10:00:00.000Z",
        created_at: "2026-01-01T10:00:00.000Z",
      },
    ];
    const stockIns = [
      {
        id: "st1",
        received_at: "2026-01-02T10:00:00.000Z",
        created_at: "2026-01-02T10:00:00.000Z",
      },
      {
        id: "st2",
        received_at: "2026-01-02T10:05:00.000Z",
        created_at: "2026-01-02T10:05:00.000Z",
      },
    ];

    const result = assignMissingInvoiceNumbers(sales, stockIns);

    expect(result.sales[0].invoice_no).toBe(1);
    expect(result.stockIns.find((row) => row.id === "st1")?.invoice_no).toBe(1);
    expect(result.stockIns.find((row) => row.id === "st2")?.invoice_no).toBe(2);
    expect(result.maxSalesInvoiceNo).toBe(1);
    expect(result.maxStockInInvoiceNo).toBe(2);
  });

  it("continues numbering within each document type after the highest existing invoice number", () => {
    const { sales, stockIns, maxSalesInvoiceNo, maxStockInInvoiceNo } =
      assignMissingInvoiceNumbers(baseTables.sales, baseTables.stock_ins);

    expect(sales[0].invoice_no).toBe(1);
    expect(stockIns.find((row) => row.id === "st1")?.invoice_no).toBe(5);
    expect(stockIns.find((row) => row.id === "st2")?.invoice_no).toBe(4);
    expect(maxSalesInvoiceNo).toBe(1);
    expect(maxStockInInvoiceNo).toBe(5);
  });
});

describe("assignLineOrder", () => {
  it("fills missing line_order within invoice groups", () => {
    const rows = assignLineOrder(
      [
        { id: "a", invoice_no: 9, received_at: "2026-01-01T00:00:00.000Z" },
        { id: "b", invoice_no: 9, received_at: "2026-01-01T00:01:00.000Z", line_order: 1 },
        { id: "c", invoice_no: 10, received_at: "2026-01-02T00:00:00.000Z" },
      ],
      "invoice_no",
    );

    expect(rows.find((row) => row.id === "a")?.line_order).toBe(0);
    expect(rows.find((row) => row.id === "b")?.line_order).toBe(1);
    expect(rows.find((row) => row.id === "c")?.line_order).toBe(0);
  });
});

describe("backfillSaleItemUnitCost", () => {
  it("uses product buying price when unit_cost is missing", () => {
    const rows = backfillSaleItemUnitCost(baseTables.sale_items, baseTables.products);
    expect(rows[0].unit_cost).toBe(50);
  });
});

describe("prepareTablesForRestore", () => {
  it("backfills legacy v1-style rows with current defaults", () => {
    const legacyTables = {
      ...baseTables,
      sales: [
        {
          id: "sale1",
          supplier_name: "Customer",
          sale_at: "2026-01-01T10:00:00.000Z",
          total_amount: 140,
          created_at: "2026-01-01T10:00:00.000Z",
        },
      ],
      stock_ins: baseTables.stock_ins.map((row) => {
        const { invoice_no: _invoiceNo, ...rest } = row as Record<string, unknown> & {
          invoice_no?: number;
        };
        return rest;
      }),
    };

    const normalized = normalizeBackupTables(legacyTables, 1);
    const prepared = prepareTablesForRestore(normalized);

    expect(prepared.sales[0].payment_status).toBe("pending");
    expect(prepared.sales[0].invoice_no).toBe(1);
    expect(prepared.sale_items[0].payment_status).toBe("pending");
    expect(prepared.sale_items[0].unit_cost).toBe(50);
    expect(prepared.sale_items[0].line_order).toBe(0);
    expect(prepared.stock_ins[0].payment_status).toBe("pending");
    expect(prepared.stock_ins[0].line_order).toBe(0);
    expect(prepared.stock_ins[1].line_order).toBe(0);
    expect(prepared.stock_ins[1].carton_quantity).toBeNull();
    expect(prepared.shop_settings[0].contacts).toBe("A: 1");
  });

  it("builds insert values for every current column", () => {
    const prepared = prepareTablesForRestore(normalizeBackupTables(baseTables, 2));
    const values = buildInsertValues("sale_items", prepared.sale_items[0]);
    expect(values).toHaveLength(12);
    expect(values[7]).toBe("pending");
    expect(values[8]).toBe(50);
  });
});

describe("resolveInvoiceSequence", () => {
  it("uses the highest invoice number from rows or payload", () => {
    const prepared = prepareTablesForRestore(normalizeBackupTables(baseTables, 2));
    expect(resolveInvoiceSequence(prepared, 3)).toBe(3);
    expect(resolveInvoiceSequence(prepared, 9)).toBe(9);
  });
});
