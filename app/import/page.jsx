"use client";

import { useState, useRef } from "react";
import AppShell from "@/components/AppShell";
import { statusBadgeClass, formatCurrency } from "@/lib/utils";
import { Upload, CheckCircle2, AlertTriangle, Download, X, FileText } from "lucide-react";

// Maps CSV column headers (flexible) to our job fields
function parseCSVRow(headers, values) {
  const row = {};
  headers.forEach((h, i) => { row[h.trim().toLowerCase().replace(/\s+/g, "_")] = (values[i] || "").trim().replace(/^"|"$/g, ""); });
  return row;
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, "").toLowerCase().replace(/\s+/g, "_"));
  return lines.slice(1).map(line => {
    // Handle quoted fields with commas inside
    const values = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') { inQuotes = !inQuotes; }
      else if (line[i] === "," && !inQuotes) { values.push(current); current = ""; }
      else { current += line[i]; }
    }
    values.push(current);
    return parseCSVRow(headers, values);
  }).filter(r => Object.values(r).some(v => v));
}

function mapToJob(row, index) {
  // Try multiple possible column name variations
  const get = (...keys) => {
    for (const k of keys) {
      if (row[k] !== undefined && row[k] !== "") return row[k];
    }
    return "";
  };

  const customer = get("customer", "customer_name", "homeowner", "name", "job_name");
  const jobId = get("job_id", "job_#", "job_number", "id", "job#", "project_id") || `IMPORT-${index + 1}`;
  const address = get("address", "street_address", "full_address");
  
  // Try to split address if it's all in one field
  let street = get("street", "street_address");
  let city = get("city");
  let state = get("state", "market");
  let zip = get("zip", "zipcode", "zip_code");

  if (!street && address) {
    // Try to parse "123 Main St, City, ST, 12345"
    const parts = address.split(",").map(p => p.trim());
    street = parts[0] || "";
    city = parts[1] || "";
    const stateZip = (parts[2] || "").trim().split(" ");
    state = stateZip[0] || "";
    zip = stateZip[1] || parts[3] || "";
  }

  const status = get("status") || "Design Review";
  const normalizedStatus = {
    "install_complete": "Install Complete",
    "complete": "Install Complete",
    "installed": "Install Complete",
    "pto_hold": "PTO Hold",
    "inspection_passed": "Inspection Passed",
    "passed": "Inspection Passed",
    "service_call": "Service Call",
    "permit_pending": "Permit Pending",
    "design_review": "Design Review",
    "review": "Design Review",
    "in_progress": "Install Complete",
    "not_completed": "Permit Pending",
  }[status.toLowerCase().replace(/\s+/g, "_")] || "Design Review";

  return {
    id: jobId,
    contractor: get("contractor") || "Empower",
    payout: parseFloat(get("payout", "partner_cost", "amount") || "0") || 0,
    customer: customer,
    phone: get("phone", "phone_number", "display3"),
    email: get("email", "email_address"),
    street,
    city,
    state: state.toUpperCase().trim(),
    zip,
    hoa: ["yes", "true", "1"].includes(get("hoa").toLowerCase()),
    systemSize: get("system_size", "kw", "system_size_kw") || "",
    panelCount: parseInt(get("panel_count", "panels") || "0") || 0,
    inverter: get("inverter") || "",
    battery: ["yes", "true", "1"].includes(get("battery").toLowerCase()),
    roofType: get("roof_type") || "",
    rep: get("rep", "salesperson", "username") || "",
    financer: get("financer", "financier", "finance") || "",
    contractAmount: parseFloat(get("contract_amount", "contract", "amount") || "0") || 0,
    utilityCompany: get("utility_company", "utility") || "",
    permitStatus: get("permit_status") || "Not Submitted",
    stage: parseInt(get("stage") || "0") || 0,
    status: normalizedStatus,
    installDate: get("install_date", "due_date") || "",
    inspectionDate: get("inspection_date") || "",
    ptoDate: get("pto_date") || "",
    siteSurveyDate: get("site_survey_date") || "",
    interconnectionStatus: get("interconnection_status") || "Not submitted",
    buildPartner: get("build_partner", "partner") || "",
    nextAction: get("next_action", "remaining_work") || "",
    notes: [get("notes"), get("additional_notes")].filter(Boolean).join(" ").trim(),
    createdAt: new Date().toISOString().split("T")[0],
    updatedAt: new Date().toISOString().split("T")[0],
  };
}

export default function ImportPage() {
  const [step, setStep] = useState("upload"); // upload | preview | done
  const [jobs, setJobs] = useState([]);
  const [errors, setErrors] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState("");
  const [importedCount, setImportedCount] = useState(0);
  const fileRef = useRef();

  function processFile(file) {
    if (!file || !file.name.endsWith(".csv")) {
      setErrors(["Please upload a .csv file."]);
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target.result;
      const rows = parseCSV(text);
      if (rows.length === 0) {
        setErrors(["No data found in CSV. Make sure it has a header row and at least one data row."]);
        return;
      }
      const mapped = rows.map((row, i) => mapToJob(row, i));
      const errs = mapped.filter(j => !j.customer).map((_, i) => `Row ${i + 1}: Missing customer name`);
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

  function handleFileInput(e) {
    processFile(e.target.files[0]);
  }

  function handleImport() {
    // In a real app this would save to database
    // For now we store in sessionStorage so the jobs page can read them
    const existing = JSON.parse(sessionStorage.getItem("importedJobs") || "[]");
    const merged = [...existing];
    jobs.forEach(job => {
      if (!merged.find(j => j.id === job.id)) merged.push(job);
    });
    sessionStorage.setItem("importedJobs", JSON.stringify(merged));
    setImportedCount(jobs.length);
    setStep("done");
  }

  function downloadTemplate() {
    const headers = [
      "job_id", "customer", "phone", "email", "street", "city", "state", "zip",
      "hoa", "system_size_kw", "panel_count", "inverter", "battery", "roof_type",
      "rep", "financer", "contract_amount", "payout", "contractor", "utility_company",
      "permit_status", "status", "stage", "install_date", "inspection_date",
      "pto_date", "site_survey_date", "build_partner", "next_action", "notes"
    ].join(",");
    const sample = [
      "CT-5274", "Janvier Paulette", "860-555-0192", "paulette@email.com",
      "84 Elmwood Ave", "Waterbury", "CT", "06704",
      "No", "14.4", "36", "Enphase IQ8A", "No", "Asphalt shingle",
      "Tommy", "GoodLeap", "11628", "11628", "Solarize", "Eversource CT",
      "Approved", "Install Complete", "80", "2026-03-03", "",
      "", "2026-01-15", "SolarCrew NE", "Schedule inspection", "Sample job - delete this row"
    ].join(",");
    const blob = new Blob([headers + "\n" + sample], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "solarize_jobs_template.csv";
    a.click();
  }

  return (
    <AppShell>
      <div className="page-header">
        <h1>Import jobs</h1>
        <p>Upload a CSV to bulk-add jobs to your pipeline.</p>
      </div>

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
              borderRadius: "var(--radius-lg)",
              padding: "48px 24px",
              textAlign: "center",
              cursor: "pointer",
              background: dragOver ? "var(--surface-2)" : "var(--surface)",
              transition: "all 0.15s",
              marginBottom: 16,
            }}
          >
            <Upload size={28} style={{ color: "var(--text-tertiary)", marginBottom: 12 }} />
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>Drop your CSV here</div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>or click to browse</div>
            <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }} onChange={handleFileInput} />
          </div>

          {errors.length > 0 && (
            <div style={{ background: "var(--red-bg)", border: "1px solid #fca5a5", borderRadius: "var(--radius-md)", padding: "12px 16px", marginBottom: 16 }}>
              {errors.map((e, i) => <div key={i} style={{ fontSize: 13, color: "var(--red-text)" }}>{e}</div>)}
            </div>
          )}

          {/* Tips */}
          <div className="card" style={{ padding: "16px 20px", marginBottom: 16 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>What your CSV needs</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: "var(--text-secondary)" }}>
              <div>✓ First row must be column headers</div>
              <div>✓ One row per job (not per event)</div>
              <div>✓ <strong style={{ color: "var(--text-primary)" }}>customer</strong> column is required — everything else is optional</div>
              <div>✓ Dates in any format (2026-03-15 or 3/15/2026)</div>
              <div>✓ Columns can be in any order</div>
            </div>
          </div>

          <button className="btn btn-outline" onClick={downloadTemplate} style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <Download size={14} /> Download blank template
          </button>
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
              <button className="btn btn-outline" onClick={() => { setStep("upload"); setJobs([]); setErrors([]); setFileName(""); }}>
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

          {/* Preview table */}
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Job ID</th>
                    <th>Customer</th>
                    <th>Address</th>
                    <th>Contractor</th>
                    <th>Status</th>
                    <th>Panels</th>
                    <th>Install date</th>
                    <th>Payout</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job, i) => (
                    <tr key={i} style={!job.customer ? { background: "#fff5f5" } : {}}>
                      <td><span className="mono badge badge-slate">{job.id}</span></td>
                      <td style={{ fontWeight: 500 }}>
                        {job.customer || <span style={{ color: "var(--red)" }}>Missing</span>}
                      </td>
                      <td style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                        {[job.street, job.city, job.state].filter(Boolean).join(", ") || "—"}
                      </td>
                      <td style={{ fontSize: 12 }}>{job.contractor || "—"}</td>
                      <td><span className={`badge ${statusBadgeClass(job.status)}`}>{job.status}</span></td>
                      <td style={{ fontSize: 12, color: "var(--text-secondary)" }}>{job.panelCount || "—"}</td>
                      <td style={{ fontSize: 12, color: "var(--text-secondary)" }}>{job.installDate || "—"}</td>
                      <td style={{ fontWeight: 500 }}>{job.payout ? formatCurrency(job.payout) : "—"}</td>
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
              Your jobs have been added to the pipeline for this session. Once you connect a database, imports will be saved permanently.
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <a href="/jobs" className="btn btn-primary">View jobs →</a>
              <button className="btn btn-outline" onClick={() => { setStep("upload"); setJobs([]); setErrors([]); setFileName(""); }}>
                Import another file
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
