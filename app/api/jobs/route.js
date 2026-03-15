import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DATA_FILE = path.join(process.cwd(), "data", "jobs.json");

function readJobs() {
  try {
    if (!fs.existsSync(DATA_FILE)) return [];
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return [];
  }
}

function writeJobs(jobs) {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(jobs, null, 2), "utf8");
}

// GET /api/jobs — return all imported jobs
export async function GET() {
  return NextResponse.json(readJobs());
}

// POST /api/jobs — merge new jobs, skip duplicates by id
export async function POST(req) {
  const incoming = await req.json();
  const existing = readJobs();
  const existingIds = new Set(existing.map(j => j.id));
  const toAdd = incoming.filter(j => !existingIds.has(j.id));
  const merged = [...existing, ...toAdd];
  writeJobs(merged);
  return NextResponse.json({ added: toAdd.length, total: merged.length });
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
