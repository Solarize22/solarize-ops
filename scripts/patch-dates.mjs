// One-time script: patches installDate + inspectionDate on existing jobs
// Usage: node scripts/patch-dates.mjs "path/to/Job_Tracker_Master_v2.csv"

import fs from "fs";
import path from "path";

const csvPath = process.argv[2];
if (!csvPath) { console.error("Usage: node scripts/patch-dates.mjs <csv-file>"); process.exit(1); }

const jobsPath = path.resolve("data/jobs.json");
const csvText = fs.readFileSync(csvPath, "utf-8");
const jobs = JSON.parse(fs.readFileSync(jobsPath, "utf-8"));

// Parse CSV (same logic as importer)
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h =>
    h.trim().replace(/^"|"$/g, "").toLowerCase().replace(/\s+/g, "_")
  );
  return lines.slice(1).map(line => {
    const values = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') { inQuotes = !inQuotes; }
      else if (line[i] === "," && !inQuotes) { values.push(current); current = ""; }
      else { current += line[i]; }
    }
    values.push(current);
    const row = {};
    headers.forEach((h, i) => { row[h] = (values[i] || "").trim().replace(/^"|"$/g, ""); });
    return row;
  }).filter(r => Object.values(r).some(v => v));
}

const rows = parseCSV(csvText);

// Build a lookup: normalize customer name for fuzzy matching
const normName = s => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

// For rows with an explicit job#, index by job#.
// For rows without, index by normalized customer name.
const byJobNum = new Map();
const byCustomer = new Map();
rows.forEach(r => {
  const jobNum = r["job_id"] || r["job_#"] || r["job_number"] || r["id"] || r["job#"] || r["project_id"];
  const name = normName(r["job_name"] || r["customer"] || r["customer_name"] || r["homeowner"] || r["name"]);
  if (jobNum) byJobNum.set(jobNum, r);
  else if (name) byCustomer.set(name, r);
});

let patched = 0;
const updated = jobs.map(job => {
  // Match by explicit job# first, then by normalized customer name
  const row = byJobNum.get(job.id) || byCustomer.get(normName(job.customer));

  if (!row) return job;

  const get = (...keys) => {
    for (const k of keys) {
      if (row[k] !== undefined && row[k] !== "") return row[k];
    }
    return "";
  };

  const toISO = v => {
    if (!v) return "";
    // MM/DD/YYYY → YYYY-MM-DD
    const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return `${m[3]}-${m[1].padStart(2,"0")}-${m[2].padStart(2,"0")}`;
    return v;
  };
  const rawInstall = get("install_date", "due_date");
  const rawInspection = get("inspection_date", "inspection");
  // Skip non-date values like "Complete" in the Inspection column
  const looksLikeDate = v => /\d/.test(v);
  const installDate = looksLikeDate(rawInstall) ? toISO(rawInstall) : "";
  const inspectionDate = looksLikeDate(rawInspection) ? toISO(rawInspection) : "";

  if (
    installDate === (job.installDate || "") &&
    inspectionDate === (job.inspectionDate || "")
  ) return job; // nothing to change

  patched++;
  return { ...job, installDate, inspectionDate };
});

fs.writeFileSync(jobsPath, JSON.stringify(updated, null, 2));
console.log(`Done. Patched ${patched} of ${jobs.length} jobs.`);
