import "dotenv/config";

process.env.JWT_SECRET ??= "test-secret-at-least-16-chars";
process.env.DATABASE_URL ??=
  "postgresql://postgres:postgres@localhost:5432/glacier_pos";
process.env.NODE_ENV ??= "test";
