import { pool } from "../db/pool.js";

export type ConsumerStatus = "VIP" | "regular" | "New";

export type Consumer = {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  status: ConsumerStatus;
  createdAt: string;
  updatedAt: string;
};

export type ConsumerInput = {
  name: string;
  phone: string;
  email: string;
  address: string;
  status: ConsumerStatus;
};

function mapRow(row: Record<string, unknown>): Consumer {
  return {
    id: row.id as string,
    name: row.name as string,
    phone: row.phone as string,
    email: row.email as string,
    address: row.address as string,
    status: row.status as ConsumerStatus,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
  };
}

export async function listConsumers(): Promise<Consumer[]> {
  const { rows } = await pool.query(`SELECT * FROM consumers ORDER BY name ASC`);
  return rows.map(mapRow);
}

export async function createConsumer(input: ConsumerInput): Promise<Consumer> {
  const { rows } = await pool.query(
    `
    INSERT INTO consumers (name, phone, email, address, status)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
    `,
    [input.name.trim(), input.phone.trim(), input.email.trim(), input.address.trim(), input.status],
  );
  return mapRow(rows[0]);
}

export async function getConsumerById(id: string): Promise<Consumer | null> {
  const { rows } = await pool.query(`SELECT * FROM consumers WHERE id = $1`, [id]);
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function updateConsumer(
  id: string,
  input: ConsumerInput,
): Promise<Consumer | null> {
  const { rows } = await pool.query(
    `
    UPDATE consumers
    SET name = $2, phone = $3, email = $4, address = $5, status = $6, updated_at = NOW()
    WHERE id = $1
    RETURNING *
    `,
    [
      id,
      input.name.trim(),
      input.phone.trim(),
      input.email.trim(),
      input.address.trim(),
      input.status,
    ],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function deleteConsumer(id: string): Promise<void> {
  const result = await pool.query(`DELETE FROM consumers WHERE id = $1`, [id]);
  if (result.rowCount === 0) {
    throw new Error("Consumer not found");
  }
}

export async function getConsumerStats() {
  const { rows } = await pool.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'VIP')::int AS vip,
      COUNT(*) FILTER (
        WHERE created_at >= date_trunc('month', NOW())
      )::int AS new_this_month
    FROM consumers
  `);
  return {
    total: Number(rows[0].total),
    vip: Number(rows[0].vip),
    newThisMonth: Number(rows[0].new_this_month),
  };
}
