import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { jobs as staticJobs } from "@/lib/data";
import { auth, currentUser } from "@clerk/nextjs/server";
import { getOrCreateUser } from "@/lib/users";
import { computeStage } from "@/lib/utils";

const USE_DB = !!process.env.POSTGRES_URL;
const DATA_FILE = path.join(process.cwd(), "data", "jobs.json");
const IMPORT_BATCHES_FILE = path.join(process.cwd(), "data", "import-batches.json");
const IMPORT_BATCH_PREVIEW_LIMIT = 5;

function readJsonFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8").trim();
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeJsonFile(filePath, value) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function readFile() {
  return readJsonFile(DATA_FILE);
}

function writeFile(jobs) {
  writeJsonFile(DATA_FILE, jobs);
}

function readImportBatchesFile() {
  return readJsonFile(IMPORT_BATCHES_FILE) || [];
}

function writeImportBatchesFile(batches) {
  writeJsonFile(IMPORT_BATCHES_FILE, batches);
}

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

async function ensureImportBatchesTable(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS import_batches (
      id   TEXT PRIMARY KEY,
      data JSONB NOT NULL
    )
  `;
}

async function dbGetAll(sql) {
  const rows = await sql`SELECT data FROM jobs ORDER BY (data->>'createdAt') ASC`;
  return rows.map(r => r.data);
}

async function dbGetImportBatches(sql) {
  const rows = await sql`
    SELECT data
    FROM import_batches
    ORDER BY (data->>'createdAt') DESC
  `;
  return rows.map(r => r.data);
}

async function dbSaveImportBatch(sql, batch) {
  await sql`
    INSERT INTO import_batches (id, data)
    VALUES (${batch.id}, ${JSON.stringify(batch)}::jsonb)
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data
  `;
}

async function dbDeleteImportBatch(sql, batchId) {
  await sql`DELETE FROM import_batches WHERE id = ${batchId}`;
}

async function dbPatch(sql, id, updates) {
  const rows = await sql`SELECT data FROM jobs WHERE id = ${id}`;
  if (!rows.length) return null;
  const merged = { ...rows[0].data, ...updates };
  await sql`UPDATE jobs SET data = ${JSON.stringify(merged)}::jsonb WHERE id = ${id}`;
  return merged;
}

function mergeJobs(existing, incoming) {
  const map = new Map(existing.map(j => [j.id, j]));
  let added = 0;
  let updated = 0;
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

const FINANCIAL_FIELDS = [
  "m1Amount",
  "m2Amount",
  "adders",
  "m1InvoiceNumber",
  "m2InvoiceNumber",
  "m1Status",
  "m2Status",
  "empowerF1",
  "empowerF2",
];

function stripFinancial(job) {
  const stripped = { ...job };
  for (const field of FINANCIAL_FIELDS) delete stripped[field];
  return stripped;
}

async function getCallerRole() {
  try {
    const { userId } = await auth();
    if (!userId) return { role: "installer", name: null };
    const clerkUser = await currentUser();
    const email = clerkUser?.emailAddresses?.[0]?.emailAddress || "";
    const name = [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ") || "User";
    const user = await getOrCreateUser(userId, { email, name });
    return { role: user.role, name: user.name, user };
  } catch {
    return { role: "installer", name: null };
  }
}

function canManageImports(role) {
  return role === "owner" || role === "admin";
}

function applyRoleFilter(jobs, role, callerName) {
  if (role === "installer" && callerName) {
    jobs = jobs.filter(j => (j.crew || []).some(
      crewName => crewName.trim().toLowerCase() === callerName.trim().toLowerCase()
    ));
  }

  if (role !== "owner") {
    jobs = jobs.map(stripFinancial);
  }

  return jobs;
}

function formatBatchSummary(batch) {
  return {
    ...batch,
    previewJobIds: (batch.jobIds || []).slice(0, IMPORT_BATCH_PREVIEW_LIMIT),
  };
}

function inferLegacyImportBatches(jobs, trackedBatches) {
  const trackedIds = new Set(trackedBatches.flatMap(batch => batch.jobIds || []));
  const groups = new Map();

  for (const job of jobs) {
    if (!job?.id || job.importBatchId || trackedIds.has(job.id)) continue;
    if (!job.createdAt) continue;
    const key = `legacy:${job.createdAt}`;
    if (!groups.has(key)) {
      groups.set(key, {
        id: key,
        label: `Legacy import ${job.createdAt}`,
        fileName: null,
        createdAt: `${job.createdAt}T12:00:00.000Z`,
        importedAt: job.createdAt,
        mode: "import",
        source: "legacy",
        jobIds: [],
      });
    }
    groups.get(key).jobIds.push(job.id);
  }

  return [...groups.values()]
    .filter(batch => batch.jobIds.length >= 3)
    .map(batch => ({
      ...batch,
      count: batch.jobIds.length,
    }));
}

async function getImportBatchesData(jobs) {
  if (USE_DB) {
    const sql = await getDb();
    await ensureImportBatchesTable(sql);
    const tracked = await dbGetImportBatches(sql);
    const legacy = inferLegacyImportBatches(jobs, tracked);
    return [...tracked, ...legacy]
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }

  const tracked = readImportBatchesFile();
  const legacy = inferLegacyImportBatches(jobs, tracked);
  return [...tracked, ...legacy]
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

function buildImportBatch({ fileName, jobIds }) {
  const now = new Date();
  const timestamp = now.toISOString();
  const batchId = `import-${timestamp.replace(/[:.]/g, "-")}`;
  const safeName = (fileName || "Untitled CSV").trim() || "Untitled CSV";

  return {
    id: batchId,
    label: safeName,
    fileName: safeName,
    createdAt: timestamp,
    importedAt: timestamp,
    mode: "import",
    source: "tracked",
    count: jobIds.length,
    jobIds,
  };
}

function normalizePostBody(body) {
  if (Array.isArray(body)) {
    return { jobs: body, importMeta: null };
  }
  return {
    jobs: Array.isArray(body?.jobs) ? body.jobs : [],
    importMeta: body?.importMeta || null,
  };
}

async function loadJobsData() {
  if (USE_DB) {
    const sql = await getDb();
    await ensureTable(sql);
    let jobs = await dbGetAll(sql);
    if (jobs.length === 0) {
      for (const job of staticJobs) {
        await sql`
          INSERT INTO jobs (id, data)
          VALUES (${job.id}, ${JSON.stringify(job)}::jsonb)
          ON CONFLICT (id) DO NOTHING
        `;
      }
      jobs = await dbGetAll(sql);
    }
    return jobs;
  }

  let jobs = readFile();
  if (!jobs) {
    jobs = staticJobs.map(job => ({ ...job }));
    writeFile(jobs);
  }
  return jobs;
}

function deleteJobsFromList(jobs, batch) {
  const trackedIds = new Set(batch.jobIds || []);
  return jobs.filter(job => {
    if (batch.source === "legacy") return !trackedIds.has(job.id);
    if (job.importBatchId) return job.importBatchId !== batch.id;
    return !trackedIds.has(job.id);
  });
}

export async function GET(req) {
  const { role, name } = await getCallerRole();
  const { searchParams } = new URL(req.url);
  const view = searchParams.get("view");
  const limit = Math.max(1, Math.min(parseInt(searchParams.get("limit") || "3", 10) || 3, 20));
  const jobs = await loadJobsData();

  if (view === "imports") {
    if (!canManageImports(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const batches = await getImportBatchesData(jobs);
    return NextResponse.json(batches.slice(0, limit).map(formatBatchSummary));
  }

  const visibleJobs = applyRoleFilter(jobs, role, name)
    .map(job => ({ ...job, stage: computeStage(job) }));
  return NextResponse.json(visibleJobs);
}

export async function POST(req) {
  const body = await req.json();
  const { jobs: incoming, importMeta } = normalizePostBody(body);

  if (!incoming.length) {
    return NextResponse.json({ added: 0, updated: 0, total: 0 });
  }

  if (USE_DB) {
    const sql = await getDb();
    await ensureTable(sql);
    await ensureImportBatchesTable(sql);

    const existing = await dbGetAll(sql);
    const existingIds = new Set(existing.map(job => job.id));
    const newJobIds = incoming.filter(job => !existingIds.has(job.id)).map(job => job.id);
    const batch = importMeta && newJobIds.length
      ? buildImportBatch({ fileName: importMeta.fileName, jobIds: newJobIds })
      : null;
    const stampedIncoming = incoming.map(job => (
      batch && !existingIds.has(job.id)
        ? { ...job, importBatchId: batch.id, importedAt: batch.importedAt }
        : job
    ));

    const { jobs: merged, added, updated } = mergeJobs(existing, stampedIncoming);
    for (const job of merged) {
      await sql`
        INSERT INTO jobs (id, data)
        VALUES (${job.id}, ${JSON.stringify(job)}::jsonb)
        ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data
      `;
    }
    if (batch) await dbSaveImportBatch(sql, batch);
    return NextResponse.json({ added, updated, total: merged.length, batch: batch ? formatBatchSummary(batch) : null });
  }

  const existing = readFile() || [];
  const existingIds = new Set(existing.map(job => job.id));
  const newJobIds = incoming.filter(job => !existingIds.has(job.id)).map(job => job.id);
  const batch = importMeta && newJobIds.length
    ? buildImportBatch({ fileName: importMeta.fileName, jobIds: newJobIds })
    : null;
  const stampedIncoming = incoming.map(job => (
    batch && !existingIds.has(job.id)
      ? { ...job, importBatchId: batch.id, importedAt: batch.importedAt }
      : job
  ));

  const { jobs: merged, added, updated } = mergeJobs(existing, stampedIncoming);
  writeFile(merged);
  if (batch) {
    const batches = readImportBatchesFile().filter(existingBatch => existingBatch.id !== batch.id);
    batches.unshift(batch);
    writeImportBatchesFile(batches);
  }
  return NextResponse.json({ added, updated, total: merged.length, batch: batch ? formatBatchSummary(batch) : null });
}

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
  const idx = jobs.findIndex(job => job.id === id);
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });
  jobs[idx] = { ...jobs[idx], ...updates };
  jobs[idx].stage = computeStage(jobs[idx]);
  writeFile(jobs);
  return NextResponse.json(jobs[idx]);
}

export async function PUT(req) {
  const incoming = await req.json();
  const notFound = [];
  let updated = 0;

  if (USE_DB) {
    const sql = await getDb();
    await ensureTable(sql);
    for (const job of incoming) {
      const rows = await sql`SELECT data FROM jobs WHERE id = ${job.id}`;
      if (!rows.length) {
        notFound.push(job.id);
        continue;
      }
      const existing = rows[0].data;
      const isEmpty = value => value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
      const merged = { ...existing };
      for (const [key, value] of Object.entries(job)) {
        if (!isEmpty(value)) merged[key] = value;
      }
      await sql`UPDATE jobs SET data = ${JSON.stringify(merged)}::jsonb WHERE id = ${job.id}`;
      updated++;
    }
    return NextResponse.json({ updated, notFound, total: incoming.length });
  }

  const jobs = readFile() || [];
  const map = new Map(jobs.map(job => [job.id, job]));
  const isEmpty = value => value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
  for (const job of incoming) {
    if (!map.has(job.id)) {
      notFound.push(job.id);
      continue;
    }
    const existing = map.get(job.id);
    const merged = { ...existing };
    for (const [key, value] of Object.entries(job)) {
      if (!isEmpty(value)) merged[key] = value;
    }
    map.set(job.id, merged);
    updated++;
  }
  writeFile([...map.values()]);
  return NextResponse.json({ updated, notFound, total: incoming.length });
}

export async function DELETE(req) {
  const { role } = await getCallerRole();
  const { searchParams } = new URL(req.url);
  const batchId = searchParams.get("batchId");

  if (batchId) {
    if (!canManageImports(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (USE_DB) {
      const sql = await getDb();
      await ensureTable(sql);
      await ensureImportBatchesTable(sql);
      const jobs = await dbGetAll(sql);
      const batches = await getImportBatchesData(jobs);
      const batch = batches.find(entry => entry.id === batchId);
      if (!batch) {
        return NextResponse.json({ error: "Import batch not found" }, { status: 404 });
      }

      const remaining = deleteJobsFromList(jobs, batch);
      await sql`DELETE FROM jobs`;
      for (const job of remaining) {
        await sql`
          INSERT INTO jobs (id, data)
          VALUES (${job.id}, ${JSON.stringify(job)}::jsonb)
        `;
      }
      if (batch.source !== "legacy") await dbDeleteImportBatch(sql, batch.id);
      return NextResponse.json({ deleted: jobs.length - remaining.length, batchId: batch.id });
    }

    const jobs = readFile() || [];
    const batches = await getImportBatchesData(jobs);
    const batch = batches.find(entry => entry.id === batchId);
    if (!batch) {
      return NextResponse.json({ error: "Import batch not found" }, { status: 404 });
    }

    const remaining = deleteJobsFromList(jobs, batch);
    writeFile(remaining);
    if (batch.source !== "legacy") {
      const tracked = readImportBatchesFile().filter(entry => entry.id !== batch.id);
      writeImportBatchesFile(tracked);
    }
    return NextResponse.json({ deleted: jobs.length - remaining.length, batchId: batch.id });
  }

  if (USE_DB) {
    const sql = await getDb();
    await ensureTable(sql);
    await sql`DELETE FROM jobs`;
    return NextResponse.json({ cleared: true });
  }

  writeFile([]);
  return NextResponse.json({ cleared: true });
}
