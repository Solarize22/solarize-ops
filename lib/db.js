import { neon } from "@neondatabase/serverless";

export function getSql() {
  const connectionString =
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL_UNPOOLED;
  if (!connectionString) {
    throw new Error("Postgres connection string is not configured. Set POSTGRES_URL or DATABASE_URL in .env.local.");
  }
  return neon(connectionString);
}
