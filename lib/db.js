import { neon } from "@neondatabase/serverless";

export function getSql() {
  const connectionString = process.env.POSTGRES_URL;
  if (!connectionString) {
    throw new Error("POSTGRES_URL is not configured");
  }
  return neon(connectionString);
}
