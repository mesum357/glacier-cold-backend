import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

function getDatabaseLabel(connectionString: string) {
  try {
    const url = new URL(connectionString);
    const database = url.pathname.replace(/^\//, "");
    return `${url.hostname}:${url.port || "5432"}/${database}`;
  } catch {
    return "unknown";
  }
}

export async function checkDatabaseConnection() {
  const label = getDatabaseLabel(process.env.DATABASE_URL!);

  try {
    const result = await pool.query(
      "SELECT current_database() AS database, version() AS version",
    );
    const { database, version } = result.rows[0] as { database: string; version: string };
    const pgVersion = version.split(" ")[1] ?? "unknown";

    console.log(`PostgreSQL connected: ${label} (database: ${database}, version: ${pgVersion})`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`PostgreSQL connection failed: ${label}`);
    console.error(`  ${message}`);
    throw err;
  }
}
