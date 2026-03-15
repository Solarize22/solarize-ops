// Deduplicates jobs.json by ID, merging all data from duplicates into one record.
// For each field, keeps the first non-empty value found across all duplicates.

import fs from "fs";
import path from "path";

const jobsPath = path.resolve("data/jobs.json");
const jobs = JSON.parse(fs.readFileSync(jobsPath, "utf-8"));

const grouped = new Map();
jobs.forEach(job => {
  if (!grouped.has(job.id)) grouped.set(job.id, []);
  grouped.get(job.id).push(job);
});

const isEmpty = v => v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);

function mergeJobs(records) {
  if (records.length === 1) return records[0];
  // Start with the first record, fill in blanks from subsequent ones
  const merged = { ...records[0] };
  for (let i = 1; i < records.length; i++) {
    const r = records[i];
    for (const key of Object.keys(r)) {
      if (isEmpty(merged[key]) && !isEmpty(r[key])) {
        merged[key] = r[key];
      }
    }
  }
  return merged;
}

const deduped = [...grouped.values()].map(mergeJobs);

const before = jobs.length;
const after = deduped.length;
const removed = before - after;

fs.writeFileSync(jobsPath, JSON.stringify(deduped, null, 2));
console.log(`Done. ${before} → ${after} jobs (removed ${removed} duplicates, merged their data).`);
