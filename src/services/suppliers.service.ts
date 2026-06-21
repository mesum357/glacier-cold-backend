import { pool } from "../db/pool.js";

export type Supplier = {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  createdAt: string;
  updatedAt: string;
};

export type SupplierInput = {
  name: string;
  phone: string;
  email: string;
  address: string;
};

function mapRow(row: Record<string, unknown>): Supplier {
  return {
    id: row.id as string,
    name: row.name as string,
    phone: row.phone as string,
    email: row.email as string,
    address: row.address as string,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
  };
}

export async function listSuppliers(): Promise<Supplier[]> {
  const { rows } = await pool.query(`SELECT * FROM suppliers ORDER BY name ASC`);
  return rows.map(mapRow);
}

export async function getSupplierById(id: string): Promise<Supplier | null> {
  const { rows } = await pool.query(`SELECT * FROM suppliers WHERE id = $1`, [id]);
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function createSupplier(input: SupplierInput): Promise<Supplier> {
  const { rows } = await pool.query(
    `
    INSERT INTO suppliers (name, phone, email, address)
    VALUES ($1, $2, $3, $4)
    RETURNING *
    `,
    [input.name.trim(), input.phone.trim(), input.email.trim(), input.address.trim()],
  );
  return mapRow(rows[0]);
}

export async function getSupplierStats() {
  const { rows } = await pool.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (
        WHERE created_at >= date_trunc('month', NOW())
      )::int AS new_this_month
    FROM suppliers
  `);
  return {
    total: Number(rows[0].total),
    newThisMonth: Number(rows[0].new_this_month),
  };
}
