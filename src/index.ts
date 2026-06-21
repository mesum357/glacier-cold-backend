import "dotenv/config";
import { createApp } from "./app.js";
import { checkDatabaseConnection } from "./db/pool.js";

const port = Number(process.env.PORT ?? 3001);
const app = createApp();

try {
  await checkDatabaseConnection();
} catch {
  process.exit(1);
}

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
