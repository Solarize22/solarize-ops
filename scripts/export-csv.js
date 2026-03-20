const fs = require("fs");
const path = require("path");

const jobs = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/jobs.json"), "utf8"));

const FIELDS = [
  "id","contractor","customer","phone","email","street","city","state","zip",
  "hoa","systemSize","panelCount","watt","inverter","battery","roofType",
  "rep","crew","partner","financer","invoiceNumber","installCost","contractAmount",
  "m1Due","m1Received","m2Due","m2Received","m1Amount","m2Amount",
  "utilityCompany","permitStatus","stage","status","installDate","inspectionDate",
  "ptoDate","siteSurveyDate","interconnectionStatus","nextAction","adders","notes",
  "createdAt","updatedAt"
];

const HEADERS = [
  "job_id","contractor","customer","phone","email","street","city","state","zip",
  "hoa","system_size","panel_count","watt","inverter","battery","roof_type",
  "rep","crew","partner","financer","invoice_number","install_cost","contract_amount",
  "m1_due","m1_received","m2_due","m2_received","m1_amount","m2_amount",
  "utility_company","permit_status","stage","status","install_date","inspection_date",
  "pto_date","site_survey_date","interconnection_status","next_action","adders","notes",
  "created_at","updated_at"
];

function escape(val) {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

const lines = [HEADERS.join(",")];
for (const job of jobs) {
  lines.push(FIELDS.map(f => escape(job[f])).join(","));
}

const out = path.join(__dirname, "../data/jobs-export.csv");
fs.writeFileSync(out, lines.join("\n"), "utf8");
console.log(`Exported ${jobs.length} jobs to ${out}`);
