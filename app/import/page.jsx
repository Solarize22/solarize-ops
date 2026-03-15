"use client";

import { useState, useRef, useEffect } from "react";
import AppShell from "@/components/AppShell";
import { statusBadgeClass, formatCurrency } from "@/lib/utils";
import { Upload, CheckCircle2, AlertTriangle, Download, X, FileText, ChevronDown, ChevronUp, Trash2, RotateCcw } from "lucide-react";

const VALID_STATUSES = [
  "Scheduled",
  "Install Complete",
  "Inspection Scheduled",
  "Inspection Passed",
  "Fully Paid / Closed",
  "Rescheduled / Issue",
];

const STATUS_MAP = {
  // Scheduled
  "scheduled":              "Scheduled",
  "permit_pending":         "Scheduled",
  "design_review":          "Scheduled",
  "review":                 "Scheduled",
  "not_completed":          "Scheduled",
  "not_started":            "Scheduled",
  // Install Complete
  "install_complete":       "Install Complete",
  "complete":               "Install Complete",
  "installed":              "Install Complete",
  "in_progress":            "Install Complete",
  "started":                "Install Complete",
  "c":                      "Install Complete",
  // Inspection Scheduled
  "inspection_scheduled":   "Inspection Scheduled",
  "waiting_inspection":     "Inspection Scheduled",
  "inspection_pending":     "Inspection Scheduled",
  // Inspection Passed
  "inspection_passed":      "Inspection Passed",
  "passed":                 "Inspection Passed",
  "need_m2":                "Inspection Passed",
  // Fully Paid / Closed
  "fully_paid_/_closed":    "Fully Paid / Closed",
  "fully_paid":             "Fully Paid / Closed",
  "closed":                 "Fully Paid / Closed",
  "paid":                   "Fully Paid / Closed",
  // Rescheduled / Issue
  "rescheduled_/_issue":    "Rescheduled / Issue",
  "rescheduled":            "Rescheduled / Issue",
  "install_rescheduled":    "Rescheduled / Issue",
  "issue":                  "Rescheduled / Issue",
  "on_hold":                "Rescheduled / Issue",
  "pto_hold":               "Rescheduled / Issue",
  "service_call":           "Rescheduled / Issue",
};

const STATE_ABBREV = {
  "connecticut": "CT", "massachusetts": "MA", "new hampshire": "NH",
  "maine": "ME", "vermont": "VT", "rhode island": "RI",
  "new york": "NY", "new jersey": "NJ", "new mexico": "NM",
  "north carolina": "NC", "north dakota": "ND", "south carolina": "SC",
  "south dakota": "SD", "west virginia": "WV", "new mexico": "NM",
  "california": "CA", "florida": "FL", "texas": "TX", "ohio": "OH",
};

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, "").toLowerCase().replace(/\s+/g, "_"));
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

function mapToJob(row, index) {
  const get = (...keys) => {
    for (const k of keys) {
      if (row[k] !== undefined && row[k] !== "") return row[k];
    }
    return "";
  };

  const customer = get("customer", "customer_name", "homeowner", "name", "job_name");
  const jobId = get("job_id", "job_#", "job_number", "id", "job#", "project_id") || `IMPORT-${index + 1}`;

  const address = get("address", "full_address");
  let street = get("street", "street_address");
  let city = get("city");
  let state = get("state", "market");
  let zip = get("zip", "zipcode", "zip_code");

  if (!street && address) {
    const parts = address.split(",").map(p => p.trim());
    street = parts[0] || "";
    city = parts[1] || "";
    const stateZip = (parts[2] || "").trim().split(" ");
    state = stateZip[0] || "";
    zip = stateZip[1] || parts[3] || "";
  }

  // Status: handle comma-separated values like "Review, Install Complete" by taking last part
  const rawStatus = (get("status") || "").split(",").map(s => s.trim()).filter(Boolean).pop() || "";
  const normalizedStatus =
    VALID_STATUSES.find(s => s.toLowerCase() === rawStatus.toLowerCase()) ||
    STATUS_MAP[rawStatus.toLowerCase().replace(/[\s/]+/g, "_")] ||
    "Scheduled";

  // Crew: accept comma or semicolon separated string
  const crewRaw = get("crew", "crew_members");
  const crew = crewRaw ? crewRaw.split(/[,;]+/).map(s => s.trim()).filter(Boolean) : [];

  const bool = v => ["yes", "true", "1", "x"].includes((v || "").toLowerCase().trim());

  // M1/M2: CSV uses "M1"/"M2" columns (TRUE/FALSE), mapper accepts those plus verbose names
  const m1Received = bool(get("m1_received", "m1_paid", "m1"));
  const m2Received = bool(get("m2_received", "m2_paid", "m2"));

  // Auto-derive m1Due / m2Due from status (same logic as the app)
  const m1Due = ["Install Complete", "Inspection Scheduled", "Inspection Passed", "Fully Paid / Closed"].includes(normalizedStatus) || m1Received;
  const m2Due = ["Inspection Passed", "Fully Paid / Closed"].includes(normalizedStatus) || m2Received;

  // Contract amount: try direct column, fall back to install_cost, then Due 80% + Due 20%
  const parseMoney = v => parseFloat((v || "").replace(/[$,]/g, "")) || 0;
  const installCost = parseMoney(get("install_cost", "cost"));
  const due80 = parseMoney(get("due_80%", "due_80"));
  const due20 = parseMoney(get("due_20%", "due_20"));
  const contractAmount =
    parseMoney(get("contract_amount", "contract", "amount", "price")) ||
    installCost ||
    (due80 + due20) ||
    0;

  // Adders
  const adders = [];
  const adderDesc = get("adder_description", "adder_desc", "adder");
  const adderCost = parseMoney(get("adder_cost"));
  if (adderDesc) adders.push({ description: adderDesc, cost: adderCost || 0 });

  return {
    id: jobId,
    customer,
    phone: get("phone", "phone_number"),
    email: get("email", "email_address"),
    street,
    city,
    state: (STATE_ABBREV[state.toLowerCase().trim()] || state.toUpperCase().trim().slice(0, 2)),
    zip,
    hoa: bool(get("hoa")),
    systemSize: get("system_size_kw", "system_size", "kw") || "",
    panelCount: parseInt(get("panel_count", "panels") || "0") || 0,
    watt: parseInt(get("watt", "watt_per_panel", "watts") || "0") || 0,
    inverter: get("inverter") || "",
    battery: bool(get("battery")),
    roofType: get("roof_type") || "",
    rep: get("rep", "salesperson") || "",
    financer: get("financer", "finance") || "",
    contractAmount,
    installCost: installCost || contractAmount,
    partner: get("partner", "build_partner") || "",
    crew,
    invoiceNumber: get("invoice_number", "invoice_#", "invoice") || "",
    utilityCompany: get("utility_company", "utility") || "",
    permitStatus: get("permit_status") || "Not Submitted",
    status: normalizedStatus,
    m1Due,
    m1Received,
    m2Due,
    m2Received,
    adders,
    installDate: get("install_date", "due_date") || "",
    inspectionDate: get("inspection_date", "inspection") || "",
    nextAction: get("next_action", "remaining_work") || "",
    notes: [get("notes"), get("additional_notes")].filter(Boolean).join(" ").trim(),
    createdAt: new Date().toISOString().split("T")[0],
  };
}

export default function ImportPage() {
  const [step, setStep] = useState("upload");
  const [jobs, setJobs] = useState([]);
  const [errors, setErrors] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState("");
  const [importedCount, setImportedCount] = useState(0);
  const [showGuide, setShowGuide] = useState(false);
  const [sessionJobCount, setSessionJobCount] = useState(0);
  const fileRef = useRef();

  useEffect(() => {
    fetch("/api/jobs")
      .then(r => r.json())
      .then(data => setSessionJobCount(Array.isArray(data) ? data.length : 0))
      .catch(() => {});
  }, [step]);

  function processFile(file) {
    if (!file || !file.name.endsWith(".csv")) {
      setErrors(["Please upload a .csv file."]);
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = e => {
      const rows = parseCSV(e.target.result);
      if (rows.length === 0) {
        setErrors(["No data found in CSV. Make sure it has a header row and at least one data row."]);
        return;
      }
      const mapped = rows.map((row, i) => mapToJob(row, i));
      const errs = mapped
        .map((j, i) => !j.customer ? `Row ${i + 1}: Missing customer name` : null)
        .filter(Boolean);
      setJobs(mapped);
      setErrors(errs);
      setStep("preview");
    };
    reader.readAsText(file);
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    processFile(e.dataTransfer.files[0]);
  }

  async function handleImport() {
    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(jobs),
    });
    const data = await res.json();
    setImportedCount(data.added ?? jobs.length);
    setStep("done");
  }

  function downloadTemplate() {
    const headers = [
      "job_id", "customer", "phone", "email",
      "street", "city", "state", "zip",
      "system_size_kw", "panel_count", "watt_per_panel",
      "inverter", "battery", "roof_type",
      "rep", "financer", "contract_amount", "install_cost",
      "partner", "crew", "invoice_number",
      "utility_company", "permit_status",
      "status", "install_date", "inspection_date",
      "m1_received", "m2_received",
      "adder_description", "adder_cost",
      "next_action", "notes",
    ].join(",");

    const sample = [
      "CT-5274", "Janvier Paulette", "860-555-0192", "paulette@email.com",
      "84 Elmwood Ave", "Waterbury", "CT", "06704",
      "14.4", "36", "400",
      "Enphase IQ8A", "No", "Asphalt shingle",
      "Tommy", "GoodLeap", "11628", "11628",
      "SolarCrew NE", "Tommy, Jake", "INV-2965",
      "Eversource CT", "Approved",
      "Install Complete", "2026-03-03", "",
      "Yes", "No",
      "200A panel upgrade", "2200",
      "Schedule inspection", "Sample job — delete this row",
    ].join(",");

    const blob = new Blob([headers + "\n" + sample], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "solarize_import_template.csv";
    a.click();
  }

  function reset() {
    setStep("upload"); setJobs([]); setErrors([]); setFileName("");
  }

  async function undoLastImport() {
    const existing = await fetch("/api/jobs").then(r => r.json());
    const importedIds = new Set(jobs.map(j => j.id));
    const remaining = existing.filter(j => !importedIds.has(j.id));
    await fetch("/api/jobs", { method: "DELETE" });
    if (remaining.length > 0) {
      await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(remaining),
      });
    }
    setSessionJobCount(remaining.length);
    reset();
  }

  async function clearAllImported() {
    await fetch("/api/jobs", { method: "DELETE" });
    setSessionJobCount(0);
  }

  return (
    <AppShell>
      <div className="page-header">
        <h1>Import jobs</h1>
        <p>Upload a CSV to bulk-add jobs to your pipeline.</p>
      </div>

      {step === "upload" && (
        <div style={{ maxWidth: 620 }}>

          {/* Session jobs banner */}
          {sessionJobCount > 0 && (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              background: "var(--amber-bg)", border: "1px solid #fcd34d",
              borderRadius: "var(--radius-md)", padding: "12px 16px", marginBottom: 16, gap: 12,
            }}>
              <div style={{ fontSize: 13, color: "var(--amber-text)" }}>
                <strong>{sessionJobCount} imported job{sessionJobCount !== 1 ? "s" : ""}</strong> active in this session
              </div>
              <button
                className="btn btn-outline"
                onClick={clearAllImported}
                style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--red)", borderColor: "var(--red)", flexShrink: 0 }}
              >
                <Trash2 size={12} /> Clear all imported jobs
              </button>
            </div>
          )}

          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current.click()}
            style={{
              border: `2px dashed ${dragOver ? "var(--text-primary)" : "var(--border-strong)"}`,
              borderRadius: "var(--radius-lg)",
              padding: "52px 24px",
              textAlign: "center",
              cursor: "pointer",
              background: dragOver ? "var(--surface-2)" : "var(--surface)",
              transition: "all 0.15s",
              marginBottom: 16,
            }}
          >
            <Upload size={28} style={{ color: "var(--text-tertiary)", marginBottom: 12 }} />
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>Drop your CSV here</div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>or click to browse · any column order · flexible headers</div>
            <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }} onChange={e => processFile(e.target.files[0])} />
          </div>

          {errors.length > 0 && (
            <div style={{ background: "var(--red-bg)", border: "1px solid #fca5a5", borderRadius: "var(--radius-md)", padding: "12px 16px", marginBottom: 16 }}>
              {errors.map((e, i) => <div key={i} style={{ fontSize: 13, color: "var(--red-text)" }}>{e}</div>)}
            </div>
          )}

          {/* Actions row */}
          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            <button className="btn btn-outline" onClick={downloadTemplate} style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <Download size={14} /> Download template
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => setShowGuide(v => !v)}
              style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}
            >
              Column guide {showGuide ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          </div>

          {/* Column guide */}
          {showGuide && (
            <div className="card" style={{ padding: "16px 20px", marginBottom: 16 }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>Accepted column headers</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 24px", fontSize: 12 }}>
                {[
                  ["job_id", "job_id / job_# / id"],
                  ["customer", "customer / homeowner / name ✱"],
                  ["phone", "phone / phone_number"],
                  ["email", "email / email_address"],
                  ["street", "street / street_address"],
                  ["city", "city"],
                  ["state", "state / market"],
                  ["zip", "zip / zipcode"],
                  ["status", "status (see values below)"],
                  ["system_size_kw", "system_size_kw / kw"],
                  ["panel_count", "panel_count / panels"],
                  ["watt_per_panel", "watt / watt_per_panel"],
                  ["inverter", "inverter"],
                  ["battery", "battery (yes/no)"],
                  ["contract_amount", "contract_amount / amount"],
                  ["install_cost", "install_cost / cost / payout"],
                  ["partner", "partner / build_partner"],
                  ["crew", "crew (comma-separated names)"],
                  ["invoice_number", "invoice_number / invoice"],
                  ["install_date", "install_date / due_date"],
                  ["inspection_date", "inspection_date"],
                  ["m1_received", "m1_received (yes/no)"],
                  ["m2_received", "m2_received (yes/no)"],
                  ["adder_description", "adder_description"],
                  ["adder_cost", "adder_cost"],
                  ["next_action", "next_action"],
                  ["notes", "notes"],
                ].map(([key, val]) => (
                  <div key={key} style={{ color: "var(--text-secondary)", lineHeight: 1.6 }}>
                    <span style={{ fontWeight: 500, color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: 11 }}>{key}</span>
                    {" — "}{val}
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 14, padding: "10px 12px", background: "var(--surface-2)", borderRadius: "var(--radius-md)" }}>
                <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 6 }}>Valid status values</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {VALID_STATUSES.map(s => (
                    <span key={s} className={`badge ${statusBadgeClass(s)}`} style={{ fontSize: 11 }}>{s}</span>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 6 }}>
                  Common aliases like "installed", "complete", "closed", "issue" are also accepted.
                </div>
              </div>
            </div>
          )}

          {/* Requirements */}
          <div className="card" style={{ padding: "14px 18px" }}>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: 5 }}>
              <div>✓ First row must be column headers</div>
              <div>✓ One row per job — <strong style={{ color: "var(--text-primary)" }}>customer</strong> is the only required column</div>
              <div>✓ Columns can be in any order, extra columns are ignored</div>
              <div>✓ Dates in any format (2026-03-15 or 3/15/2026)</div>
              <div>✓ Crew can be comma-separated in one cell: <span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>Tommy, Jake</span></div>
            </div>
          </div>
        </div>
      )}

      {step === "preview" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <FileText size={15} style={{ color: "var(--text-secondary)" }} />
                <span style={{ fontWeight: 600 }}>{fileName}</span>
              </div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                {jobs.length} job{jobs.length !== 1 ? "s" : ""} ready to import
                {errors.length > 0 && <span style={{ color: "var(--amber)", marginLeft: 8 }}>· {errors.length} warning{errors.length !== 1 ? "s" : ""}</span>}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-outline" onClick={reset} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <X size={13} /> Cancel
              </button>
              <button className="btn btn-primary" onClick={handleImport}>
                Import {jobs.length} job{jobs.length !== 1 ? "s" : ""}
              </button>
            </div>
          </div>

          {errors.length > 0 && (
            <div style={{ background: "var(--amber-bg)", border: "1px solid #fcd34d", borderRadius: "var(--radius-md)", padding: "12px 16px", marginBottom: 16 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: "var(--amber-text)", marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
                <AlertTriangle size={13} /> Warnings (rows will still import)
              </div>
              {errors.map((e, i) => <div key={i} style={{ fontSize: 12, color: "var(--amber)" }}>{e}</div>)}
            </div>
          )}

          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Job ID</th>
                    <th>Customer</th>
                    <th>Address</th>
                    <th>Status</th>
                    <th>Contract $</th>
                    <th>Crew</th>
                    <th>Install date</th>
                    <th>M1</th>
                    <th>M2</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job, i) => (
                    <tr key={i} style={!job.customer ? { background: "#fff5f5" } : undefined}>
                      <td><span className="mono badge badge-slate">{job.id}</span></td>
                      <td style={{ fontWeight: 500 }}>
                        {job.customer || <span style={{ color: "var(--red)" }}>Missing</span>}
                      </td>
                      <td style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                        {[job.street, job.city, job.state].filter(Boolean).join(", ") || "—"}
                      </td>
                      <td><span className={`badge ${statusBadgeClass(job.status)}`}>{job.status}</span></td>
                      <td style={{ fontWeight: 500 }}>{job.contractAmount ? formatCurrency(job.contractAmount) : "—"}</td>
                      <td style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                        {job.crew?.length > 0 ? job.crew.join(", ") : "—"}
                      </td>
                      <td style={{ fontSize: 12, color: "var(--text-secondary)" }}>{job.installDate || "—"}</td>
                      <td style={{ fontSize: 12 }}>
                        {job.m1Due
                          ? <span style={{ color: job.m1Received ? "var(--green)" : "var(--amber)" }}>{job.m1Received ? "✓ Rcvd" : "Due"}</span>
                          : <span style={{ color: "var(--text-tertiary)" }}>—</span>}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {job.m2Due
                          ? <span style={{ color: job.m2Received ? "var(--green)" : "var(--amber)" }}>{job.m2Received ? "✓ Rcvd" : "Due"}</span>
                          : <span style={{ color: "var(--text-tertiary)" }}>—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {step === "done" && (
        <div style={{ maxWidth: 480 }}>
          <div className="card" style={{ padding: "32px", textAlign: "center" }}>
            <CheckCircle2 size={36} style={{ color: "var(--green)", marginBottom: 16 }} />
            <div style={{ fontWeight: 600, fontSize: 18, marginBottom: 8 }}>
              {importedCount} job{importedCount !== 1 ? "s" : ""} imported
            </div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 24, lineHeight: 1.7 }}>
              Added to your pipeline for this session. Jobs already in the system by ID were skipped.
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <a href="/jobs" className="btn btn-primary">View jobs →</a>
              <button className="btn btn-outline" onClick={reset}>Import another file</button>
            </div>
          </div>

          {/* Undo strip */}
          <div style={{
            marginTop: 12, padding: "12px 16px",
            background: "var(--surface-2)", borderRadius: "var(--radius-md)",
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          }}>
            <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              Something look wrong? Remove everything you just imported.
            </div>
            <button
              className="btn btn-outline"
              onClick={undoLastImport}
              style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--red)", borderColor: "var(--red)", flexShrink: 0 }}
            >
              <RotateCcw size={12} /> Undo this import
            </button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
