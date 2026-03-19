import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { jobs as staticJobs } from "@/lib/data";
import { auth, currentUser } from "@clerk/nextjs/server";
import { getOrCreateUser } from "@/lib/users";
import { computeStage } from "@/lib/utils";

// ─── Neon (production) vs file (local dev) ───────────────────────────────────
const USE_DB = !!process.env.POSTGRES_URL;

// ── File-based helpers (local dev) ──────────────────────────────────────────
const DATA_FILE = path.join(process.cwd(), "data", "jobs.json");

function readFile() {
  try {
    if (!fs.existsSync(DATA_FILE)) return null;
    const raw = fs.readFileSync(DATA_FILE, "utf8").trim();
    if (!raw || raw === "[]") return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function writeFile(jobs) {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(jobs, null, 2), "utf8");
}

// ── Neon helpers (production) ────────────────────────────────────────────────
async function getDb() {
  const { neon } = await import("@neondatabase/serverless");
  return neon(process.env.POSTGRES_URL);
}

async function ensureTable(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS jobs (
      id   TEXT PRIMARY KEY,
      data JSONB NOT NULL
    )
  `;
}

async function dbGetAll(sql) {
  const rows = await sql`SELECT data FROM jobs ORDER BY (data->>'createdAt') ASC`;
  return rows.map(r => r.data);
}

async function dbUpsertMany(sql, jobs) {
  if (!jobs.length) return { added: 0, updated: 0 };
  let added = 0, updated = 0;
  const existing = await sql`SELECT id FROM jobs`;
  const existingIds = new Set(existing.map(r => r.id));
  for (const job of jobs) {
    if (existingIds.has(job.id)) {
      await sql`
        UPDATE jobs
        SET data = (
          SELECT jsonb_object_agg(key, CASE WHEN existing_val = '' OR existing_val IS NULL THEN new_val ELSE existing_val END)
          FROM jsonb_each_text(data) AS e(key, existing_val)
          JOIN jsonb_each_text(${JSON.stringify(job)}::jsonb) AS n(key, new_val) USING (key)
          UNION ALL
          SELECT key, value FROM jsonb_each_text(${JSON.stringify(job)}::jsonb)
          WHERE key NOT IN (SELECT key FROM jsonb_each_text(data))
        )
        WHERE id = ${job.id}
      `;
      updated++;
    } else {
      await sql`INSERT INTO jobs (id, data) VALUES (${job.id}, ${JSON.stringify(job)}::jsonb)`;
      added++;
    }
  }
  return { added, updated };
}

async function dbPatch(sql, id, updates) {
  const rows = await sql`SELECT data FROM jobs WHERE id = ${id}`;
  if (!rows.length) return null;
  const merged = { ...rows[0].data, ...updates };
  await sql`UPDATE jobs SET data = ${JSON.stringify(merged)}::jsonb WHERE id = ${id}`;
  return merged;
}

// ── Merge helper (shared) ────────────────────────────────────────────────────
function mergeJobs(existing, incoming) {
  const map = new Map(existing.map(j => [j.id, j]));
  let added = 0, updated = 0;
  const isEmpty = v => v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
  for (const job of incoming) {
    if (map.has(job.id)) {
      const prev = map.get(job.id);
      const merged = { ...prev };
      for (const [k, v] of Object.entries(job)) {
        if (isEmpty(merged[k]) && !isEmpty(v)) merged[k] = v;
      }
      map.set(job.id, merged);
      updated++;
    } else {
      map.set(job.id, job);
      added++;
    }
  }
  return { jobs: [...map.values()], added, updated };
}

// ── RBAC helpers ─────────────────────────────────────────────────────────────

// Financial fields that non-owners should NOT see
const FINANCIAL_FIELDS = [
  "m1Amount", "m2Amount", "contractAmount", "installCost", "invoiceNumber",
];

function stripFinancial(job) {
  const stripped = { ...job };
  for (const f of FINANCIAL_FIELDS) delete stripped[f];
  return stripped;
}

async function getCallerRole() {
  try {
    const { userId } = await auth();
    if (!userId) return { role: "installer", name: null };
    const clerkUser = await currentUser();
    const email = clerkUser?.emailAddresses?.[0]?.emailAddress || "";
    const name  = [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ") || "User";
    const user  = await getOrCreateUser(userId, { email, name });
    return { role: user.role, name: user.name, user };
  } catch {
    return { role: "installer", name: null };
  }
}

function applyRoleFilter(jobs, role, callerName) {
  // Installer: only see jobs where their name is in crew
  if (role === "installer" && callerName) {
    jobs = jobs.filter(j => (j.crew || []).some(
      c => c.trim().toLowerCase() === callerName.trim().toLowerCase()
    ));
  }

  // Non-owners: strip financial data
  if (role !== "owner") {
    jobs = jobs.map(stripFinancial);
  }

  return jobs;
}

// ── GET /api/jobs ─────────────────────────────────────────────────────────────
export async function GET() {
  const { role, name } = await getCallerRole();

  let jobs;
  if (USE_DB) {
    const sql = await getDb();
    await ensureTable(sql);
    jobs = await dbGetAll(sql);
    if (jobs.length === 0) {
      for (const j of staticJobs) {
        await sql`INSERT INTO jobs (id, data) VALUES (${j.id}, ${JSON.stringify(j)}::jsonb) ON CONFLICT (id) DO NOTHING`;
      }
      jobs = await dbGetAll(sql);
    }
  } else {
    jobs = readFile();
    if (!jobs) {
      jobs = staticJobs.map(j => ({ ...j }));
      writeFile(jobs);
    }
  }

  jobs = applyRoleFilter(jobs, role, name);
  jobs = jobs.map(j => ({ ...j, stage: computeStage(j) }));
  return NextResponse.json(jobs);
}

// ── POST /api/jobs — upsert ───────────────────────────────────────────────────
export async function POST(req) {
  const incoming = await req.json();
  if (USE_DB) {
    const sql = await getDb();
    await ensureTable(sql);
    const existing = await dbGetAll(sql);
    const { jobs: merged, added, updated } = mergeJobs(existing, incoming);
    for (const job of merged) {
      await sql`
        INSERT INTO jobs (id, data) VALUES (${job.id}, ${JSON.stringify(job)}::jsonb)
        ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data
      `;
    }
    return NextResponse.json({ added, updated, total: merged.length });
  }
  const existing = readFile() || [];
  const { jobs: merged, added, updated } = mergeJobs(existing, incoming);
  writeFile(merged);
  return NextResponse.json({ added, updated, total: merged.length });
}

// ── PATCH /api/jobs — update single job ──────────────────────────────────────
export async function PATCH(req) {
  const { id, updates } = await req.json();
  if (USE_DB) {
    const sql = await getDb();
    await ensureTable(sql);
    const result = await dbPatch(sql, id, updates);
    if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const withStage = { ...result, stage: computeStage(result) };
    await sql`UPDATE jobs SET data = ${JSON.stringify(withStage)}::jsonb WHERE id = ${id}`;
    return NextResponse.json(withStage);
  }
  const jobs = readFile() || [];
  const idx = jobs.findIndex(j => j.id === id);
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });
  jobs[idx] = { ...jobs[idx], ...updates };
  jobs[idx].stage = computeStage(jobs[idx]);
  writeFile(jobs);
  return NextResponse.json(jobs[idx]);
}

// ── PUT /api/jobs — bulk update existing jobs (overwrite non-blank fields) ────
export async function PUT(req) {
  const incoming = await req.json();
  const notFound = [];
  let updated = 0;

  if (USE_DB) {
    const sql = await getDb();
    await ensureTable(sql);
    for (const job of incoming) {
      const rows = await sql`SELECT data FROM jobs WHERE id = ${job.id}`;
      if (!rows.length) { notFound.push(job.id); continue; }
      const existing = rows[0].data;
      const isEmpty = v => v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
      const merged = { ...existing };
      for (const [k, v] of Object.entries(job)) {
        if (!isEmpty(v)) merged[k] = v;
      }
      await sql`UPDATE jobs SET data = ${JSON.stringify(merged)}::jsonb WHERE id = ${job.id}`;
      updated++;
    }
    return NextResponse.json({ updated, notFound, total: incoming.length });
  }

  const jobs = readFile() || [];
  const map = new Map(jobs.map(j => [j.id, j]));
  const isEmpty = v => v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
  for (const job of incoming) {
    if (!map.has(job.id)) { notFound.push(job.id); continue; }
    const existing = map.get(job.id);
    const merged = { ...existing };
    for (const [k, v] of Object.entries(job)) {
      if (!isEmpty(v)) merged[k] = v;
    }
    map.set(job.id, merged);
    updated++;
  }
  writeFile([...map.values()]);
  return NextResponse.json({ updated, notFound, total: incoming.length });
}

// ── DELETE /api/jobs — clear all ─────────────────────────────────────────────
export async function DELETE() {
  if (USE_DB) {
    const sql = await getDb();
    await ensureTable(sql);
    await sql`DELETE FROM jobs`;
    return NextResponse.json({ cleared: true });
  }
  writeFile([]);
  return NextResponse.json({ cleared: true });
}
