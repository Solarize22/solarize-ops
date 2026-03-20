"use client";

import { useState, useRef } from "react";
import AppShell from "@/components/AppShell";
import { statusBadgeClass } from "@/lib/utils";
import { Upload, Download, X, CheckCircle2, AlertTriangle, FileText } from "lucide-react";

// ── CSV parsing & mapping ────────────────────────────────────────────────────

const VALID_STATUSES = [
  "Scheduled", "Install Complete", "Inspection Scheduled",
  "Inspection Passed", "Fully Paid / Closed", "Rescheduled / Issue",
];

const STATUS_MAP = {
  "scheduled": "Scheduled", "permit_pending": "Scheduled", "design_review": "Scheduled",
  "review": "Scheduled", "not_completed": "Scheduled", "not_started": "Scheduled",
  "install_complete": "Install Complete", "complete": "Install Complete",
  "installed": "Install Complete", "in_progress": "Install Complete", "c": "Install Complete",
  "inspection_scheduled": "Inspection Scheduled", "waiting_inspection": "Inspection Scheduled",
  "inspection_pending": "Inspection Scheduled",
  "inspection_passed": "Inspection Passed", "passed": "Inspection Passed", "need_m2": "Inspection Passed",
  "fully_paid_/_closed": "Fully Paid / Closed", "fully_paid": "Fully Paid / Closed",
  "closed": "Fully Paid / Closed", "paid": "Fully Paid / Closed",
  "rescheduled_/_issue": "Rescheduled / Issue", "rescheduled": "Rescheduled / Issue",
  "install_rescheduled": "Rescheduled / Issue", "issue": "Rescheduled / Issue",
  "on_hold": "Rescheduled / Issue", "pto_hold": "Rescheduled / Issue",
};

const STATE_ABBREV = {
  "connecticut": "CT", "massachusetts": "MA", "new hampshire": "NH",
  "maine": "ME", "vermont": "VT", "rhode island": "RI",
  "new york": "NY", "new jersey": "NJ", "california": "CA",
  "florida": "FL", "texas": "TX", "ohio": "OH",
};

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h =>
    h.trim().replace(/^"|"$/g, "").toLowerCase().replace(/[\s\-/()]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "")
  );
  return lines.slice(1).map(line => {
    const values = [];
    let current = "", inQuotes = false;
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

function mapToJob(row, index) {
  const get = (...keys) => {
    for (const k of keys) if (row[k] !== undefined && row[k] !== "") return row[k];
    return "";
  };

  const customer = get("customer", "customer_name", "homeowner", "name", "job_name");
  const jobId    = get("job_id", "job_#", "job_number", "id", "job#", "project_id") || `IMPORT-${index + 1}`;
  const address  = get("address", "full_address");
  let street = get("street", "street_address");
  let city   = get("city");
  let state  = get("state", "market");
  let zip    = get("zip", "zipcode", "zip_code");

  if (!street && address) {
    const parts = address.split(",").map(p => p.trim());
    street = parts[0] || "";
    city   = parts[1] || "";
    const stateZip = (parts[2] || "").trim().split(" ");
    state  = stateZip[0] || "";
    zip    = stateZip[1] || parts[3] || "";
  }

  const rawStatus = (get("status") || "").split(",").map(s => s.trim()).filter(Boolean).pop() || "";
  const normalizedStatus =
    VALID_STATUSES.find(s => s.toLowerCase() === rawStatus.toLowerCase()) ||
    STATUS_MAP[rawStatus.toLowerCase().replace(/[\s/]+/g, "_")] ||
    "Scheduled";

  const crewRaw = get("crew", "crew_members");
  const crew    = crewRaw ? crewRaw.split(/[,;]+/).map(s => s.trim()).filter(Boolean) : [];
  const bool    = v => ["yes", "true", "1", "x"].includes((v || "").toLowerCase().trim());
  const money   = v => parseFloat((v || "").replace(/[$,]/g, "")) || 0;

  const m1Received = bool(get("m1_received", "m1_paid", "m1"));
  const m2Received = bool(get("m2_received", "m2_paid", "m2"));
  const m1Due = ["Install Complete","Inspection Scheduled","Inspection Passed","Fully Paid / Closed"].includes(normalizedStatus) || m1Received;
  const m2Due = ["Inspection Passed","Fully Paid / Closed"].includes(normalizedStatus) || m2Received;

  // M1/M2 amounts are the source of truth; contractAmount falls back for legacy CSVs
  const m1Amount = money(get("m1_amount", "m1_amt", "due_80%", "due_80")) ||
                   money(get("contract_amount", "contract", "amount", "price", "install_cost", "cost")) * 0.8 || 0;
  const m2Amount = money(get("m2_amount", "m2_amt", "due_20%", "due_20")) ||
                   money(get("contract_amount", "contract", "amount", "price", "install_cost", "cost")) * 0.2 || 0;
  const installCost    = money(get("install_cost", "cost"));
  const contractAmount = (m1Amount + m2Amount) || installCost || 0;

  return {
    id:              jobId,
    customer,
    phone:           get("phone", "phone_number"),
    email:           get("email", "email_address"),
    street,
    city,
    state:           STATE_ABBREV[state.toLowerCase().trim()] || state.toUpperCase().trim().slice(0, 2),
    zip,
    hoa:             bool(get("hoa")),
    systemSize:      get("system_size_kw", "system_size", "kw"),
    panelCount:      parseInt(get("panel_count", "panels") || "0") || 0,
    watt:            parseInt(get("watt", "watt_per_panel", "watt_panel", "watts") || "0") || 0,
    inverter:        get("inverter"),
    battery:         bool(get("battery")),
    roofType:        get("roof_type"),
    rep:             get("rep", "salesperson"),
    financer:        get("financer", "finance"),
    m1Amount,
    m2Amount,
    contractAmount,
    installCost:     installCost || contractAmount,
    partner:         get("partner", "build_partner"),
    crew,
    invoiceNumber:   get("invoice_number", "invoice_#", "invoice"),
    utilityCompany:  get("utility_company", "utility"),
    permitStatus:    get("permit_status") || "Not Submitted",
    status:          normalizedStatus,
    m1Due, m1Received, m2Due, m2Received,
    installDate:     get("install_date", "due_date"),
    inspectionDate:  get("inspection_date", "inspection"),
    nextAction:      get("next_action", "remaining_work"),
    notes:           [get("notes"), get("additional_notes")].filter(Boolean).join(" ").trim(),
    createdAt:       new Date().toISOString().split("T")[0],
    // New fields from CSV
    deal:            get("deal"),
    module:          get("module"),
    qty:             parseInt(get("qty") || "0") || 0,
    ageD:            parseInt(get("age_(d)", "age_d", "age") || "0") || 0,
    stageD:          parseFloat(get("stage_(d)", "stage_d", "lifetime_production") || "0") || 0,
    buildPartner:    get("build_partner", "partner"),
    monitoring:      get("monitoring"),
    monitoringAlerts: parseInt(get("monitoring_alerts", "alerts") || "0") || 0,
    lifetimeProduction: get("lifetime_production"),
    contractSigned:  get("contract_signed", "contract_date"),
    fileCreated:     get("file_created"),
    syncDate:        get("sync_date"),
  };
}

// ── Update mapper: only includes fields actually present in CSV ──────────────
// Used for "Update existing jobs" mode — never applies defaults, never blanks
// existing data. mapToJob is used for import only.
function mapToJobUpdate(row) {
  const val = (...keys) => {
    for (const k of keys) if (row[k] !== undefined && row[k] !== "") return row[k];
    return null;
  };
  const has = (...keys) => keys.some(k => row[k] !== undefined && row[k] !== "");
  const money = v => parseFloat((v || "").replace(/[$,]/g, "")) || 0;
  const bool  = v => ["yes", "true", "1", "x"].includes((v || "").toLowerCase().trim());

  const jobId = val("job_id", "job_#", "job_number", "id", "job#", "project_id");
  if (!jobId) return null;

  const result = { id: jobId };

  // Text fields — only set if CSV cell is non-empty
  if (has("customer","customer_name","homeowner","name")) result.customer   = val("customer","customer_name","homeowner","name");
  if (has("phone","phone_number"))                        result.phone       = val("phone","phone_number");
  if (has("email","email_address"))                       result.email       = val("email","email_address");
  if (has("street","street_address"))                     result.street      = val("street","street_address");
  if (has("city"))                                        result.city        = val("city");
  if (has("state","market"))                              result.state       = val("state","market");
  if (has("zip","zipcode","zip_code"))                    result.zip         = val("zip","zipcode","zip_code");
  if (has("rep","salesperson"))                           result.rep         = val("rep","salesperson");
  if (has("financer","finance"))                          result.financer    = val("financer","finance");
  if (has("partner","build_partner"))                     result.partner     = val("partner","build_partner");
  if (has("invoice_number","invoice_#","invoice"))        result.invoiceNumber = val("invoice_number","invoice_#","invoice");
  if (has("utility_company","utility"))                   result.utilityCompany = val("utility_company","utility");
  if (has("inverter"))                                    result.inverter    = val("inverter");
  if (has("roof_type"))                                   result.roofType    = val("roof_type");
  if (has("system_size_kw","system_size","kw")) result.systemSize = val("system_size_kw","system_size","kw");
  if (has("next_action","remaining_work"))                result.nextAction  = val("next_action","remaining_work");
  if (has("notes","additional_notes"))                    result.notes       = [val("notes"), val("additional_notes")].filter(Boolean).join(" ").trim();
  if (has("permit_status"))                               result.permitStatus = val("permit_status");

  // Status — only if explicitly provided
  const rawStatus = val("status");
  if (rawStatus) {
    result.status =
      VALID_STATUSES.find(s => s.toLowerCase() === rawStatus.toLowerCase()) ||
      STATUS_MAP[rawStatus.toLowerCase().replace(/[\s/]+/g, "_")] ||
      rawStatus;
  }

  // Dates — only if present
  if (has("install_date","due_date"))    result.installDate    = val("install_date","due_date");
  if (has("inspection_date","inspection")) result.inspectionDate = val("inspection_date","inspection");

  // Crew — only if present
  if (has("crew","crew_members")) {
    const raw = val("crew","crew_members");
    result.crew = raw ? raw.split(/[,;]+/).map(s => s.trim()).filter(Boolean) : [];
  }

  // Amounts — only if present and > 0
  if (has("m1_amount","m1_amt")) {
    const v = money(val("m1_amount","m1_amt"));
    if (v > 0) result.m1Amount = v;
  }
  if (has("m2_amount","m2_amt")) {
    const v = money(val("m2_amount","m2_amt"));
    if (v > 0) result.m2Amount = v;
  }
  if (result.m1Amount || result.m2Amount) {
    result.contractAmount = (result.m1Amount || 0) + (result.m2Amount || 0);
  }

  // Payment flags — only if explicitly present
  if (has("m1_received","m1_paid")) result.m1Received = bool(val("m1_received","m1_paid"));
  if (has("m2_received","m2_paid")) result.m2Received = bool(val("m2_received","m2_paid"));

  // Numeric fields — only if present and non-zero
  const panelCount = parseInt(val("panel_count","panels") || "0") || 0;
  if (panelCount) result.panelCount = panelCount;
  const watt = parseInt(val("watt","watt_per_panel","watt_panel","watts") || "0") || 0;
  if (watt) result.watt = watt;

  // New fields — only if present and non-empty (preserves existing data)
  const v_deal = val("deal");
  if (v_deal && v_deal !== "—") result.deal = v_deal;
  const v_module = val("module");
  if (v_module && v_module !== "—") result.module = v_module;
  if (has("qty")) {
    const q = parseInt(val("qty") || "0") || 0;
    if (q > 0) result.qty = q;
  }
  if (has("age_(d)","age_d","age")) {
    const age = parseInt(val("age_(d)","age_d","age") || "0") || 0;
    if (age > 0) result.ageD = age;
  }
  if (has("stage_(d)","stage_d","lifetime_production")) {
    const stage = parseFloat(val("stage_(d)","stage_d","lifetime_production") || "0") || 0;
    if (stage > 0) result.stageD = stage;
  }
  const v_buildPartner = val("build_partner","partner");
  if (v_buildPartner && v_buildPartner !== "—") result.buildPartner = v_buildPartner;
  const v_monitoring = val("monitoring");
  if (v_monitoring && v_monitoring !== "—") result.monitoring = v_monitoring;
  if (has("monitoring_alerts","alerts")) {
    const alerts = parseInt(val("monitoring_alerts","alerts") || "0") || 0;
    if (alerts > 0) result.monitoringAlerts = alerts;
  }
  const v_production = val("lifetime_production");
  if (v_production && v_production !== "—") result.lifetimeProduction = v_production;
  const v_contractSigned = val("contract_signed","contract_date");
  if (v_contractSigned && v_contractSigned !== "—") result.contractSigned = v_contractSigned;
  const v_fileCreated = val("file_created");
  if (v_fileCreated && v_fileCreated !== "—") result.fileCreated = v_fileCreated;
  const v_syncDate = val("sync_date");
  if (v_syncDate && v_syncDate !== "—") result.syncDate = v_syncDate;

  return result;
}

const TEMPLATE_HEADERS = [
  "job_id","customer","phone","email",
  "street","city","state","zip",
  "system_size_kw","panel_count","watt_per_panel","inverter","battery","roof_type",
  "rep","financer","m1_amount","m2_amount",
  "partner","crew","invoice_number","utility_company",
  "status","install_date","inspection_date",
  "m1_received","m2_received",
  "next_action","notes",
];

const TEMPLATE_SAMPLE = [
  "CT-5274","Janvier Paulette","860-555-0192","paulette@email.com",
  "84 Elmwood Ave","Waterbury","CT","06704",
  "14.4","36","400","Enphase IQ8A","No","Asphalt shingle",
  "Tommy","GoodLeap","9302","2326",
  "SolarCrew NE","Tommy, Jake","INV-2965","Eversource CT",
  "Install Complete","2026-03-03","",
  "Yes","No",
  "Schedule inspection","Sample job — delete this row",
];

// ── Component ────────────────────────────────────────────────────────────────

export default function ImportPage() {
  const [mode, setMode]       = useState("import"); // "import" | "update"
  const [step, setStep]       = useState("upload"); // "upload" | "preview" | "done"
  const [fileName, setFileName] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState(null);   // { rows: [...], existingIds }
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef();

  function reset() {
    setStep("upload"); setFileName(""); setPreview(null); setResults(null);
  }

  function downloadTemplate() {
    const csv = [TEMPLATE_HEADERS.join(","), TEMPLATE_SAMPLE.join(",")].join("\n");
    const a   = document.createElement("a");
    a.href    = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "solarize_template.csv";
    a.click();
  }

  async function processFile(file) {
    if (!file || !file.name.endsWith(".csv")) return;
    setFileName(file.name);

    const text = await file.text();
    const rawRows = parseCSV(text);
    if (!rawRows.length) return;

    const mapped = mode === "update"
      ? rawRows.map(r => mapToJobUpdate(r)).filter(Boolean)
      : rawRows.map((r, i) => mapToJob(r, i));

    // Fetch existing jobs to check for duplicates / matches
    const existing = await fetch("/api/jobs").then(r => r.json()).catch(() => []);
    const existingIds = new Set(Array.isArray(existing) ? existing.map(j => j.id) : []);

    const rows = mapped.map(job => {
      if (mode === "import") {
        if (!job.customer) return { ...job, _status: "error", _reason: "Missing customer name" };
        if (!job.id || job.id.startsWith("IMPORT-")) return { ...job, _status: "error", _reason: "Missing job number" };
        if (!job.street && !job.city) return { ...job, _status: "error", _reason: "Missing address" };
        if (existingIds.has(job.id)) return { ...job, _status: "duplicate", _reason: "Job number already exists" };
        return { ...job, _status: "valid" };
      } else {
        // update mode
        if (!job.id) return { ...job, _status: "error", _reason: "Missing job number" };
        if (!existingIds.has(job.id)) return { ...job, _status: "unmatched", _reason: "Job number not found" };
        return { ...job, _status: "matched" };
      }
    });

    setPreview({ rows });
    setStep("preview");
  }

  function handleDrop(e) {
    e.preventDefault(); setDragOver(false);
    processFile(e.dataTransfer.files[0]);
  }

  async function handleConfirm() {
    setLoading(true);
    const actionRows = preview.rows.filter(r =>
      mode === "import" ? r._status === "valid" : r._status === "matched"
    );
    const payload = actionRows.map(({ _status, _reason, ...job }) => job);

    const skipped = preview.rows.filter(r => r._status !== "valid" && r._status !== "matched");

    try {
      let succeeded = 0;
      const failed = skipped.map(r => ({ id: r.id, customer: r.customer, reason: r._reason }));

      if (mode === "import") {
        const res  = await fetch("/api/jobs", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(payload),
        });
        const data = await res.json();
        succeeded  = data.added ?? payload.length;
      } else {
        const res  = await fetch("/api/jobs", {
          method:  "PUT",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(payload),
        });
        const data = await res.json();
        succeeded  = data.updated ?? payload.length;
        if (data.notFound?.length) {
          data.notFound.forEach(id => failed.push({ id, reason: "Not found during update" }));
        }
      }

      setResults({ total: preview.rows.length, succeeded, failed });
      setStep("done");
    } catch (err) {
      setResults({ total: preview.rows.length, succeeded: 0, failed: [{ id: "—", reason: "Network error: " + err.message }] });
      setStep("done");
    } finally {
      setLoading(false);
    }
  }

  // ── Counts for preview ──
  const validCount     = preview?.rows.filter(r => r._status === "valid" || r._status === "matched").length ?? 0;
  const skippedCount   = preview?.rows.filter(r => r._status !== "valid" && r._status !== "matched").length ?? 0;

  return (
    <AppShell>
      <div className="page-header">
        <h1>Import / Update jobs</h1>
        <p>Bulk import new jobs or update existing ones via CSV.</p>
      </div>

      {/* Mode toggle */}
      {step !== "done" && (
        <div style={{ display: "flex", background: "var(--surface-2)", borderRadius: "var(--radius-md)", padding: 3, gap: 2, width: "fit-content", marginBottom: 24 }}>
          {[["import", "Import new jobs"], ["update", "Update existing jobs"]].map(([m, label]) => (
            <button
              key={m}
              onClick={() => { setMode(m); reset(); }}
              style={{
                padding: "7px 18px", borderRadius: "var(--radius-sm)", border: "none",
                cursor: "pointer", fontSize: 13, fontWeight: 600,
                fontFamily: "var(--font-body)",
                background: mode === m ? "var(--text-primary)" : "transparent",
                color: mode === m ? "white" : "var(--text-secondary)",
                transition: "background .15s",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* ── Upload step ── */}
      {step === "upload" && (
        <div style={{ maxWidth: 600 }}>
          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current.click()}
            style={{
              border: `2px dashed ${dragOver ? "var(--text-primary)" : "var(--border-strong)"}`,
              borderRadius: "var(--radius-lg)", padding: "52px 24px",
              textAlign: "center", cursor: "pointer",
              background: dragOver ? "var(--surface-2)" : "var(--surface)",
              transition: "all .15s", marginBottom: 16,
            }}
          >
            <Upload size={28} style={{ color: "var(--text-tertiary)", marginBottom: 12 }} />
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>Drop your CSV here</div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>or click to browse</div>
            <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }}
              onChange={e => processFile(e.target.files[0])} />
          </div>

          <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
            <button className="btn btn-outline" onClick={downloadTemplate}
              style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <Download size={14} /> Download CSV template
            </button>
          </div>

          <div className="card" style={{ padding: "14px 18px" }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
              {mode === "import" ? "Importing new jobs" : "Updating existing jobs"}
            </div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: 5 }}>
              {mode === "import" ? <>
                <div>✓ Required columns: <strong>job_id</strong>, <strong>customer</strong>, <strong>street</strong> (or <strong>city</strong>)</div>
                <div>✓ Rows where the job number already exists will be skipped</div>
                <div>✓ All other fields are optional</div>
              </> : <>
                <div>✓ Required column: <strong>job_id</strong> — used to match each row to an existing job</div>
                <div>✓ Only fills in columns that have a value — blank cells don't overwrite</div>
                <div>✓ Rows where the job number is not found will be skipped</div>
              </>}
              <div>✓ Dates in any format (2026-03-15 or 3/15/2026)</div>
              <div>✓ Crew: comma-separated names in one cell</div>
            </div>
          </div>
        </div>
      )}

      {/* ── Preview step ── */}
      {step === "preview" && preview && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <FileText size={14} style={{ color: "var(--text-secondary)" }} />
                <span style={{ fontWeight: 600 }}>{fileName}</span>
              </div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                <span style={{ color: "var(--green)", fontWeight: 600 }}>{validCount} row{validCount !== 1 ? "s" : ""}</span>
                {" "}will be {mode === "import" ? "imported" : "updated"}
                {skippedCount > 0 && (
                  <span style={{ color: "#dc2626", marginLeft: 10, fontWeight: 600 }}>
                    {skippedCount} will be skipped
                  </span>
                )}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-outline" onClick={reset}
                style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <X size={13} /> Back
              </button>
              <button
                className="btn btn-primary"
                onClick={handleConfirm}
                disabled={loading || validCount === 0}
              >
                {loading ? "Processing…" : mode === "import"
                  ? `Import ${validCount} job${validCount !== 1 ? "s" : ""}`
                  : `Update ${validCount} job${validCount !== 1 ? "s" : ""}`}
              </button>
            </div>
          </div>

          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Job #</th>
                    <th>Customer</th>
                    <th>Address</th>
                    <th>Job status</th>
                    <th>Install date</th>
                    <th>Crew</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row, i) => {
                    const isSkipped = row._status !== "valid" && row._status !== "matched";
                    return (
                      <tr key={i} style={{ background: isSkipped ? "#fff5f5" : undefined, opacity: isSkipped ? 0.75 : 1 }}>
                        <td>
                          {isSkipped
                            ? <span style={{ fontSize: 11, fontWeight: 600, color: "#dc2626", background: "#fee2e2", padding: "2px 8px", borderRadius: 20, whiteSpace: "nowrap" }}>
                                {row._reason}
                              </span>
                            : <span style={{ fontSize: 11, fontWeight: 600, color: "#15803d", background: "#d8f3dc", padding: "2px 8px", borderRadius: 20 }}>
                                {mode === "import" ? "Will import" : "Will update"}
                              </span>
                          }
                        </td>
                        <td><span className="mono badge badge-slate">{row.id}</span></td>
                        <td style={{ fontWeight: 500 }}>{row.customer || <span style={{ color: "#dc2626" }}>—</span>}</td>
                        <td style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                          {[row.street, row.city, row.state].filter(Boolean).join(", ") || "—"}
                        </td>
                        <td><span className={`badge ${statusBadgeClass(row.status)}`}>{row.status}</span></td>
                        <td style={{ fontSize: 12, color: "var(--text-secondary)" }}>{row.installDate || "—"}</td>
                        <td style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                          {row.crew?.length ? row.crew.join(", ") : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Done step ── */}
      {step === "done" && results && (
        <div style={{ maxWidth: 520 }}>
          <div className="card" style={{ padding: 28, marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
              <CheckCircle2 size={28} style={{ color: "var(--green)", flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 17 }}>
                  {mode === "import" ? "Import complete" : "Update complete"}
                </div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>
                  {fileName}
                </div>
              </div>
            </div>

            {/* Summary counts */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: results.failed.length ? 20 : 0 }}>
              {[
                { label: "Rows processed", value: results.total, color: "var(--text-primary)" },
                { label: mode === "import" ? "Imported" : "Updated", value: results.succeeded, color: "var(--green)" },
                { label: "Skipped", value: results.failed.length, color: results.failed.length ? "#dc2626" : "var(--text-tertiary)" },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background: "var(--surface-2)", borderRadius: "var(--radius-md)", padding: "12px 14px" }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color, letterSpacing: "-0.02em" }}>{value}</div>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em" }}>{label}</div>
                </div>
              ))}
            </div>

            {/* Failed rows */}
            {results.failed.length > 0 && (
              <div style={{ border: "1px solid #fca5a5", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
                <div style={{ background: "#fee2e2", padding: "10px 14px", display: "flex", alignItems: "center", gap: 7 }}>
                  <AlertTriangle size={13} style={{ color: "#dc2626" }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#7f1d1d" }}>Skipped rows</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {results.failed.map((f, i) => (
                    <div key={i} style={{
                      display: "flex", gap: 12, padding: "9px 14px", fontSize: 12,
                      borderTop: i > 0 ? "1px solid #fecaca" : undefined,
                      alignItems: "baseline",
                    }}>
                      <span className="mono badge badge-slate" style={{ flexShrink: 0 }}>{f.id || "—"}</span>
                      {f.customer && <span style={{ color: "var(--text-secondary)", flexShrink: 0 }}>{f.customer}</span>}
                      <span style={{ color: "#dc2626" }}>{f.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <a href="/jobs" className="btn btn-primary">View jobs →</a>
            <button className="btn btn-outline" onClick={reset}>
              {mode === "import" ? "Import another file" : "Update another file"}
            </button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
