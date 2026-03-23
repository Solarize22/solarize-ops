"use client";

import { useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import { statusBadgeClass } from "@/lib/utils";
import { evaluateImportDraft, mapCsvRowToDraft, parseCsv } from "@/lib/job-import";
import { CheckCircle2, Download, FileText, Upload, X, AlertTriangle } from "lucide-react";

const STATUS_OPTIONS = [
  { value: "scheduled", label: "Scheduled", meaning: "Job exists but install is not complete yet." },
  { value: "install_completed", label: "Install complete", meaning: "Install is done and the job is ready to move forward." },
  { value: "inspection_scheduled", label: "Inspection scheduled", meaning: "Inspection has been arranged but not passed yet." },
  { value: "inspection_passed", label: "Inspection passed", meaning: "Inspection is complete and approved." },
  { value: "pto_granted", label: "PTO granted", meaning: "Utility has granted PTO." },
  { value: "m1_invoiced", label: "M1 invoiced", meaning: "M1 exists but is not fully paid." },
  { value: "m1_paid", label: "M1 paid", meaning: "M1 has been fully paid." },
  { value: "m2_invoiced", label: "M2 invoiced", meaning: "M2 exists but is not fully paid." },
  { value: "paid_in_full", label: "Paid in full / closed", meaning: "All job invoices are paid." },
  { value: "on_hold", label: "On hold / issue", meaning: "The job needs manual ops attention before moving forward." },
];

const TEMPLATE_HEADERS = [
  "job_id","customer","phone","email",
  "street","city","state","zip","county",
  "system_size_kw","panel_count","watt_per_panel","inverter","battery","roof_type",
  "rep","financer","deal","module","contractor","build_partner","crew","utility_company",
  "m1_invoice_number","m1_amount","m1_status",
  "m2_invoice_number","m2_amount","m2_status",
  "adders",
  "install_date","inspection_date","pto_date","site_survey_date","contract_signed",
  "status","notes",
];

const TEMPLATE_SAMPLE = [
  "CT-5274","Janvier Paulette","860-555-0192","paulette@email.com",
  "84 Elmwood Ave","Waterbury","CT","06704","New Haven",
  "14.4","36","400","Enphase IQ8A","No","Asphalt shingle",
  "Tommy","GoodLeap","Loan","Jinko 400","Solarize","SolarCrew NE","Tommy, Jake","Eversource CT",
  "INV-2965","9302","Yes",
  "INV-2966","2326","No",
  "0",
  "2026-03-03","","","2026-01-15","2026-01-15",
  "install_completed","Sample job - delete this row",
];

const TEMPLATE_INSTRUCTIONS = [
  "# SOLARIZE CRM IMPORT TEMPLATE",
  "# Leave the header row exactly as-is.",
  "# One job per row.",
  "# Required for new imports: job_id, customer, and street or city.",
  "# Required for updates: job_id only.",
  "# Dates: use MM/DD/YYYY or YYYY-MM-DD.",
  "# Yes/No fields: battery, m1_status, m2_status.",
  "# m1_status: Yes means importer records an M1 payment for the full M1 amount. No or blank means no payment is imported.",
  "# m2_status: Yes means importer records an M2 payment for the full M2 amount. No or blank means no payment is imported.",
  "# m1_invoice_number and m2_invoice_number create or update real invoice records.",
  "# m1_amount and m2_amount are dollar amounts, no commas preferred.",
  "# adders creates an adder invoice amount when greater than 0.",
  "# status accepted values: scheduled, install_completed, inspection_scheduled, inspection_passed, pto_granted, m1_invoiced, m1_paid, m2_invoiced, paid_in_full, on_hold.",
  "# Blank cells do not overwrite existing values in update mode.",
  "# Delete the sample row before real upload if you do not want it imported.",
];

function renderStatusPill(mode, row) {
  const isReady = mode === "import" ? row.previewStatus === "valid" : row.previewStatus === "matched";
  if (isReady) {
    return (
      <span style={{ fontSize: 11, fontWeight: 600, color: "#15803d", background: "#d8f3dc", padding: "2px 8px", borderRadius: 20 }}>
        {mode === "import" ? "Will import" : "Will update"}
      </span>
    );
  }

  return (
    <span style={{ fontSize: 11, fontWeight: 600, color: "#dc2626", background: "#fee2e2", padding: "2px 8px", borderRadius: 20, whiteSpace: "nowrap" }}>
      {row.previewReason}
    </span>
  );
}

export default function ImportPage() {
  const [mode, setMode] = useState("import");
  const [step, setStep] = useState("upload");
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState(null);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef(null);

  const validCount = preview?.rows.filter((row) => row.previewStatus === "valid" || row.previewStatus === "matched").length ?? 0;
  const skippedCount = preview?.rows.filter((row) => row.previewStatus !== "valid" && row.previewStatus !== "matched").length ?? 0;

  function reset() {
    setStep("upload");
    setDragOver(false);
    setFileName("");
    setPreview(null);
    setResults(null);
  }

  function downloadTemplate() {
    const csv = [...TEMPLATE_INSTRUCTIONS, TEMPLATE_HEADERS.join(","), TEMPLATE_SAMPLE.join(",")].join("\n");
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    anchor.download = "solarize_template.csv";
    anchor.click();
  }

  async function parseApiResponse(res, fallbackMessage) {
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok) {
      throw new Error(data?.error || data?.message || fallbackMessage || `Request failed (${res.status})`);
    }
    return data;
  }

  async function processFile(file) {
    if (!file || !file.name.toLowerCase().endsWith(".csv")) return;

    setFileName(file.name);
    const text = await file.text();
    const records = parseCsv(text);
    if (!records.length) return;

    const existing = await fetch("/api/v2/jobs").then((res) => res.json()).catch(() => []);
    const existingJobNumbers = new Set(Array.isArray(existing) ? existing.map((job) => job.jobNumber) : []);

    const rows = records
      .map((record, index) => mapCsvRowToDraft(record, index, mode))
      .map((draft) => evaluateImportDraft(draft, mode, existingJobNumbers));

    setPreview({ rows });
    setStep("preview");
  }

  function handleDrop(event) {
    event.preventDefault();
    setDragOver(false);
    processFile(event.dataTransfer.files[0]);
  }

  async function handleConfirm() {
    if (!preview) return;
    setLoading(true);

    const actionRows = preview.rows.filter((row) => mode === "import" ? row.previewStatus === "valid" : row.previewStatus === "matched");
    const payload = actionRows.map(({ previewStatus, previewReason, actions, raw, derivedStatusLabel, ...row }) => row);
    const failed = preview.rows
      .filter((row) => row.previewStatus !== "valid" && row.previewStatus !== "matched")
      .map((row) => ({ id: row.jobNumber, customer: row.customerName, reason: row.previewReason }));

    try {
      if (mode === "import") {
        const res = await fetch("/api/v2/import/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobs: payload, importMeta: { fileName } }),
        });
        const data = await parseApiResponse(res, "Import failed");
        if (data.failed?.length) failed.push(...data.failed);
        setResults({
          total: preview.rows.length,
          succeeded: data.added ?? payload.length,
          failed,
        });
      } else {
        const res = await fetch("/api/v2/import/jobs", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await parseApiResponse(res, "Update failed");
        if (data.failed?.length) failed.push(...data.failed);
        if (data.notFound?.length) {
          data.notFound.forEach((id) => failed.push({ id, reason: "Job number not found during update" }));
        }
        setResults({
          total: preview.rows.length,
          succeeded: data.updated ?? payload.length,
          failed,
        });
      }

      setStep("done");
    } catch (error) {
      setResults({
        total: preview.rows.length,
        succeeded: 0,
        failed: [{ id: "-", reason: `Network error: ${error.message}` }],
      });
      setStep("done");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell>
      <div className="page-header">
        <h1>Import jobs</h1>
        <p>Bring jobs into the CRM with explicit job, milestone, invoice, payment, and adder mapping.</p>
      </div>

      {step !== "done" && (
        <div style={{ display: "flex", background: "var(--surface-2)", borderRadius: "var(--radius-md)", padding: 3, gap: 2, width: "fit-content", marginBottom: 24 }}>
          {[["import", "Import new jobs"], ["update", "Update existing jobs"]].map(([value, label]) => (
            <button
              key={value}
              onClick={() => { setMode(value); reset(); }}
              style={{
                padding: "7px 18px",
                borderRadius: "var(--radius-sm)",
                border: "none",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
                fontFamily: "var(--font-body)",
                background: mode === value ? "var(--text-primary)" : "transparent",
                color: mode === value ? "white" : "var(--text-secondary)",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {step === "upload" && (
        <div style={{ maxWidth: 760 }}>
          <div
            onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            style={{
              border: `2px dashed ${dragOver ? "var(--text-primary)" : "var(--border-strong)"}`,
              borderRadius: "var(--radius-lg)",
              padding: "52px 24px",
              textAlign: "center",
              cursor: "pointer",
              background: dragOver ? "var(--surface-2)" : "var(--surface)",
              transition: "all .15s",
              marginBottom: 16,
            }}
          >
            <Upload size={28} style={{ color: "var(--text-tertiary)", marginBottom: 12 }} />
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>Drop your CSV here</div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>or click to browse</div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              style={{ display: "none" }}
              onChange={(event) => processFile(event.target.files[0])}
            />
          </div>

          <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
            <button className="btn btn-outline" onClick={downloadTemplate} style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <Download size={14} /> Download CSV template
            </button>
            <a className="btn btn-outline" href="/import-instructions.html" target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <FileText size={14} /> Open import instructions
            </a>
          </div>

          <div className="card" style={{ padding: "16px 18px", marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>How this importer works now</div>
            <div style={{ display: "grid", gap: 6, fontSize: 13, color: "var(--text-secondary)" }}>
              <div>Jobs update the real CRM tables instead of writing into a loose blob.</div>
              <div>M1, M2, and adders are handled as invoice records.</div>
              <div>Paid flags create payment records only when the CSV actually provides that payment signal.</div>
              <div>The preview shows CRM actions, not just raw field values.</div>
            </div>
          </div>

          <div className="card" style={{ padding: "16px 18px", marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Dummy-proof upload steps</div>
            <div style={{ display: "grid", gap: 6, fontSize: 13, color: "var(--text-secondary)" }}>
              <div>1. Download the template and keep the header row exactly as-is.</div>
              <div>2. Fill one job per row. Do not merge cells or add notes above the header row.</div>
              <div>3. Use dates like <span className="mono">03/21/2026</span> or <span className="mono">2026-03-21</span>.</div>
              <div>4. Use <span className="mono">Yes</span> or <span className="mono">No</span> for payment flags and battery.</div>
              <div>5. Leave optional fields blank if you do not know them yet.</div>
              <div>6. Upload the file, review the preview actions, then confirm.</div>
            </div>
          </div>

          <div className="card" style={{ padding: "16px 18px", marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>
              {mode === "import" ? "Import rules" : "Update rules"}
            </div>
            <div style={{ display: "grid", gap: 6, fontSize: 13, color: "var(--text-secondary)" }}>
              {mode === "import" ? (
                <>
                  <div>Required columns: <span className="mono">job_id</span>, <span className="mono">customer</span>, and either <span className="mono">street</span> or <span className="mono">city</span>.</div>
                  <div>Duplicate job numbers are skipped.</div>
                  <div>Milestones, invoices, payments, and adders are optional and only created when supplied.</div>
                  <div>Recommended columns for a clean import: <span className="mono">install_date</span>, <span className="mono">inspection_date</span>, <span className="mono">pto_date</span>, <span className="mono">m1_amount</span>, <span className="mono">m2_amount</span>.</div>
                </>
              ) : (
                <>
                  <div>Required column: <span className="mono">job_id</span>.</div>
                  <div>Only the columns present in the CSV are updated.</div>
                  <div>Blank cells do not erase existing CRM values.</div>
                  <div>Missing payment flags no longer reopen invoices by accident.</div>
                </>
              )}
            </div>
          </div>

          <div className="card" style={{ padding: "16px 18px", marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Template columns</div>
            <div style={{ display: "grid", gap: 6, fontSize: 13, color: "var(--text-secondary)" }}>
              <div><strong>Core job:</strong> <span className="mono">job_id</span>, <span className="mono">customer</span>, <span className="mono">phone</span>, <span className="mono">email</span>, <span className="mono">street</span>, <span className="mono">city</span>, <span className="mono">state</span>, <span className="mono">zip</span>, <span className="mono">county</span></div>
              <div><strong>System:</strong> <span className="mono">system_size_kw</span>, <span className="mono">panel_count</span>, <span className="mono">watt_per_panel</span>, <span className="mono">inverter</span>, <span className="mono">battery</span>, <span className="mono">roof_type</span>, <span className="mono">module</span></div>
              <div><strong>Job setup:</strong> <span className="mono">rep</span>, <span className="mono">financer</span>, <span className="mono">deal</span>, <span className="mono">contractor</span>, <span className="mono">build_partner</span>, <span className="mono">crew</span>, <span className="mono">utility_company</span></div>
              <div><strong>Financials:</strong> <span className="mono">m1_invoice_number</span>, <span className="mono">m1_amount</span>, <span className="mono">m1_status</span>, <span className="mono">m2_invoice_number</span>, <span className="mono">m2_amount</span>, <span className="mono">m2_status</span>, <span className="mono">adders</span></div>
              <div><strong>Milestones:</strong> <span className="mono">contract_signed</span>, <span className="mono">site_survey_date</span>, <span className="mono">install_date</span>, <span className="mono">inspection_date</span>, <span className="mono">pto_date</span>, <span className="mono">status</span>, <span className="mono">notes</span></div>
            </div>
          </div>

          <div className="card" style={{ padding: "16px 18px" }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Status options</div>
            <div style={{ display: "grid", gap: 8 }}>
              {STATUS_OPTIONS.map((option) => (
                <div key={option.value} style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 12, alignItems: "start" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span className={`badge ${statusBadgeClass(option.value)}`}>{option.label}</span>
                    <span className="mono" style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{option.value}</span>
                  </div>
                  <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{option.meaning}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

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
                {" "}ready
                {skippedCount > 0 && (
                  <span style={{ color: "#dc2626", marginLeft: 10, fontWeight: 600 }}>
                    {skippedCount} skipped
                  </span>
                )}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-outline" onClick={reset} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <X size={13} /> Back
              </button>
              <button className="btn btn-primary" onClick={handleConfirm} disabled={loading || validCount === 0}>
                {loading ? "Processing..." : mode === "import" ? `Import ${validCount} job${validCount !== 1 ? "s" : ""}` : `Update ${validCount} job${validCount !== 1 ? "s" : ""}`}
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
                    <th>CRM status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row, index) => {
                    const isSkipped = row.previewStatus !== "valid" && row.previewStatus !== "matched";
                    return (
                      <tr key={`${row.jobNumber}-${index}`} style={{ background: isSkipped ? "#fff5f5" : undefined, opacity: isSkipped ? 0.78 : 1 }}>
                        <td>{renderStatusPill(mode, row)}</td>
                        <td><span className="mono badge badge-slate">{row.jobNumber || "-"}</span></td>
                        <td style={{ fontWeight: 500 }}>{row.customerName || <span style={{ color: "#dc2626" }}>-</span>}</td>
                        <td style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                          {[row.address?.street1, row.address?.city, row.address?.state].filter(Boolean).join(", ") || "-"}
                        </td>
                        <td><span className={`badge ${statusBadgeClass(row.derivedStatus)}`}>{row.derivedStatusLabel}</span></td>
                        <td style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                          {row.actions?.length ? row.actions.join(", ") : "-"}
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

      {step === "done" && results && (
        <div style={{ maxWidth: 560 }}>
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

            {results.failed.length > 0 && (
              <div style={{ border: "1px solid #fca5a5", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
                <div style={{ background: "#fee2e2", padding: "10px 14px", display: "flex", alignItems: "center", gap: 7 }}>
                  <AlertTriangle size={13} style={{ color: "#dc2626" }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#7f1d1d" }}>Skipped rows</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {results.failed.map((item, index) => (
                    <div
                      key={`${item.id}-${index}`}
                      style={{
                        display: "flex",
                        gap: 12,
                        padding: "9px 14px",
                        fontSize: 12,
                        borderTop: index > 0 ? "1px solid #fecaca" : undefined,
                        alignItems: "baseline",
                      }}
                    >
                      <span className="mono badge badge-slate" style={{ flexShrink: 0 }}>{item.id || "-"}</span>
                      {item.customer && <span style={{ color: "var(--text-secondary)", flexShrink: 0 }}>{item.customer}</span>}
                      <span style={{ color: "#dc2626" }}>{item.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <a href="/jobs" className="btn btn-primary">View jobs</a>
            <button className="btn btn-outline" onClick={reset}>
              {mode === "import" ? "Import another file" : "Update another file"}
            </button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
