import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import fs from "fs";
import path from "path";
import { jobs as staticJobs } from "@/lib/data";

// POST /api/seed — one-time migration: push all jobs from data/jobs.json to Neon
// Hit this once after first deploy: fetch('/api/seed', { method: 'POST' })
export async function POST() {
  if (!process.env.POSTGRES_URL) {
    return NextResponse.json({ error: "No POSTGRES_URL — not in production" }, { status: 400 });
  }

  const sql = neon(process.env.POSTGRES_URL);

  // Ensure table exists
  await sql`
    CREATE TABLE IF NOT EXISTS jobs (
      id   TEXT PRIMARY KEY,
      data JSONB NOT NULL
    )
  `;

  // Load jobs from data/jobs.json if it exists, otherwise fall back to static jobs
  let jobs = staticJobs;
  try {
    const filePath = path.join(process.cwd(), "data", "jobs.json");
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) jobs = parsed;
    }
  } catch {}

  let inserted = 0, skipped = 0;
  for (const job of jobs) {
    const result = await sql`
      INSERT INTO jobs (id, data)
      VALUES (${job.id}, ${JSON.stringify(job)}::jsonb)
      ON CONFLICT (id) DO NOTHING
    `;
    if (result.count > 0) inserted++;
    else skipped++;
  }

  return NextResponse.json({ inserted, skipped, total: jobs.length });
}
