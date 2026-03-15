import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { jobs as staticJobs } from "@/lib/data";

const DATA_FILE = path.join(process.cwd(), "data", "jobs.json");

function readJobs() {
  try {
    if (!fs.existsSync(DATA_FILE)) return null;
    const raw = fs.readFileSync(DATA_FILE, "utf8").trim();
    if (!raw || raw === "[]") return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeJobs(jobs) {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(jobs, null, 2), "utf8");
}

// GET /api/jobs — seed from static jobs on first run, then return all
export async function GET() {
  let jobs = readJobs();
  if (!jobs) {
    // First run — seed from lib/data.js static jobs
    jobs = staticJobs.map(j => ({ ...j }));
    writeJobs(jobs);
  }
  return NextResponse.json(jobs);
}

// POST /api/jobs — upsert: update existing by id, add new ones
export async function POST(req) {
  const incoming = await req.json();
  const existing = readJobs() || [];
  const map = new Map(existing.map(j => [j.id, j]));
  let added = 0, updated = 0;
  for (const job of incoming) {
    if (map.has(job.id)) {
      // Merge: keep existing values, fill in any blanks from incoming
      const prev = map.get(job.id);
      const isEmpty = v => v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
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
  const final = [...map.values()];
  writeJobs(final);
  return NextResponse.json({ added, updated, total: final.length });
}

// DELETE /api/jobs — clear all imported jobs
export async function DELETE() {
  writeJobs([]);
  return NextResponse.json({ cleared: true });
}

// PATCH /api/jobs — update a single job by id
export async function PATCH(req) {
  const { id, updates } = await req.json();
  const jobs = readJobs();
  const idx = jobs.findIndex(j => j.id === id);
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });
  jobs[idx] = { ...jobs[idx], ...updates };
  writeJobs(jobs);
  return NextResponse.json(jobs[idx]);
}
