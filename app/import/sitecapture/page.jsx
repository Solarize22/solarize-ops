"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import { statusBadgeClass } from "@/lib/utils";
import { evaluateImportDraft, mapCsvRowToDraft, parseCsv } from "@/lib/job-import";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileSpreadsheet,
  RotateCcw,
  Upload,
  X,
} from "lucide-react";

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

export default function SiteCaptureImportPage() {
  const [mode, setMode] = useState("import");
  const [step, setStep] = useState("upload");
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState(null);
  const [results, setResults] = useState(null);
  const [recentBatches, setRecentBatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [revertingBatchId, setRevertingBatchId] = useState(null);
  const fileRef = useRef(null);
  const isEventPreview = preview?.importType === "event";

  const validCount = preview?.rows.filter((row) => row.previewStatus === "valid" || row.previewStatus === "matched").length ?? 0;
  const skippedCount = preview?.rows.filter((row) => row.previewStatus !== "valid" && row.previewStatus !== "matched").length ?? 0;

  function reset() {
    setStep("upload");
    setDragOver(false);
    setFileName("");
    setPreview(null);
    setResults(null);
  }

  async function loadRecentBatches() {
    try {
      const res = await fetch("/api/v2/import/batches?source=sitecapture&limit=5");
      const data = await res.json();
      setRecentBatches(Array.isArray(data) ? data : []);
    } catch {
      setRecentBatches([]);
    }
  }

  useEffect(() => {
    loadRecentBatches();
  }, []);

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

    const mappedRows = records.map((record, index) => mapCsvRowToDraft(record, index, mode));
    const effectiveMode = mappedRows.some((row) => row.importType === "event") ? "update" : mode;
    if (effectiveMode !== mode) setMode(effectiveMode);

    const rows = records
      .map((record, index) => mapCsvRowToDraft(record, index, effectiveMode))
      .map((draft) => evaluateImportDraft(draft, effectiveMode, existingJobNumbers));

    setPreview({
      importType: rows.some((row) => row.importType === "event") ? "event" : "job",
      rows,
    });
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
      if (preview.importType === "event") {
        const res = await fetch("/api/v2/import/sitecapture-events", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await parseApiResponse(res, "Event update failed");
        if (data.failed?.length) failed.push(...data.failed);
        if (data.notFound?.length) {
          data.notFound.forEach((id) => failed.push({ id, reason: "Job number not found during event import" }));
        }
        setResults({
          importType: "event",
          total: preview.rows.length,
          succeeded: data.updated ?? payload.length,
          failed,
          batch: null,
        });
      } else if (mode === "import") {
        const res = await fetch("/api/v2/import/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobs: payload, importMeta: { fileName, source: "sitecapture" } }),
        });
        const data = await parseApiResponse(res, "Import failed");
        if (data.failed?.length) failed.push(...data.failed);
        setResults({
          importType: "job",
          total: preview.rows.length,
          succeeded: data.added ?? payload.length,
          failed,
          batch: data.batch || null,
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
          importType: "job",
          total: preview.rows.length,
          succeeded: data.updated ?? payload.length,
          failed,
          batch: null,
        });
      }

      setStep("done");
      await loadRecentBatches();
    } catch (error) {
      setResults({
        importType: preview.importType || "job",
        total: preview.rows.length,
        succeeded: 0,
        failed: [{ id: "-", reason: `Network error: ${error.message}` }],
        batch: null,
      });
      setStep("done");
    } finally {
      setLoading(false);
    }
  }

  async function handleRevert(batchId) {
    if (!batchId) return;
    setRevertingBatchId(batchId);
    try {
      const res = await fetch(`/api/v2/import/batches/${batchId}`, { method: "DELETE" });
      await parseApiResponse(res, "Failed to revert import batch");
      if (results?.batch?.id === batchId) {
        setResults((current) => current ? { ...current, batch: null } : current);
      }
      await loadRecentBatches();
    } finally {
      setRevertingBatchId(null);
    }
  }

  return (
    <AppShell>
      <div className="page-header">
        <h1>Import SiteCapture CSV</h1>
        <p>Use raw SiteCapture exports directly without reformatting them into the generic CRM template first.</p>
      </div>

      {step !== "done" ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 24 }}>
          <Link href="/import" className="btn btn-outline" style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
            <ArrowLeft size={14} /> Back to standard importer
          </Link>
          <div style={{ display: "flex", background: "var(--surface-2)", borderRadius: "var(--radius-md)", padding: 3, gap: 2, width: "fit-content" }}>
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
        </div>
      ) : null}

      {step === "upload" ? (
        <div style={{ maxWidth: 820 }}>
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
              marginBottom: 18,
            }}
          >
            <Upload size={28} style={{ color: "var(--text-tertiary)", marginBottom: 12 }} />
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Drop your SiteCapture export here</div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 6 }}>This flow expects the raw CSV exported from SiteCapture Advanced Search.</div>
            <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Keep both header rows intact. Do not rebuild the file in Excel first.</div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              style={{ display: "none" }}
              onChange={(event) => processFile(event.target.files[0])}
            />
          </div>

          <div style={{ display: "grid", gap: 16 }}>
            <div className="card" style={{ padding: "16px 18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
                <FileSpreadsheet size={15} style={{ color: "var(--text-secondary)" }} />
                <div style={{ fontSize: 14, fontWeight: 700 }}>SiteCapture export workflow</div>
              </div>
              <div style={{ display: "grid", gap: 6, fontSize: 13, color: "var(--text-secondary)" }}>
                <div>1. In SiteCapture, open Advanced Search or the saved search you want.</div>
                <div>2. Click Export results and download the CSV exactly as SiteCapture gives it to you.</div>
                <div>3. Upload that raw CSV here without deleting the first or second header row.</div>
                <div>4. Review the preview. We prefer the trailing CRM-style number in <span className="mono">job_name</span> and fall back to SiteCapture ids only if needed.</div>
                <div>5. Use the revert controls below if a created import batch needs to be rolled back.</div>
              </div>
            </div>

            <div className="card" style={{ padding: "16px 18px" }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>What this SiteCapture path maps</div>
              <div style={{ display: "grid", gap: 6, fontSize: 13, color: "var(--text-secondary)" }}>
                <div><strong>Job number:</strong> trailing CRM-style number from <span className="mono">job_name</span> or <span className="mono">display1</span>, then <span className="mono">project_number</span>, then <span className="mono">project_id</span></div>
                <div><strong>Customer:</strong> <span className="mono">first_name</span> + <span className="mono">last_name</span> or the SiteCapture job name</div>
                <div><strong>Core fields:</strong> address, phone, email, utility provider, rep username, notes, and milestone dates</div>
                <div><strong>Important note:</strong> the revert button only removes jobs created by a tracked import batch. It does not undo update-mode imports.</div>
              </div>
            </div>

            {recentBatches.length ? (
              <div className="card" style={{ padding: "16px 18px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
                  <RotateCcw size={15} style={{ color: "var(--text-secondary)" }} />
                  <div style={{ fontSize: 14, fontWeight: 700 }}>Recent reversible SiteCapture imports</div>
                </div>
                <div style={{ display: "grid", gap: 10 }}>
                  {recentBatches.map((batch) => (
                    <div key={batch.id} style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "12px 14px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700 }}>{batch.fileName || "Untitled SiteCapture import"}</div>
                          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 3 }}>
                            {new Date(batch.createdAt).toLocaleString()} · {batch.jobCount} created job{batch.jobCount === 1 ? "" : "s"}
                          </div>
                          {batch.previewJobs?.length ? (
                            <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 6 }}>
                              {batch.previewJobs.map((job) => `${job.jobNumber} ${job.customerName || ""}`.trim()).join(" • ")}
                            </div>
                          ) : null}
                        </div>
                        <button
                          className="btn btn-outline"
                          onClick={() => handleRevert(batch.id)}
                          disabled={revertingBatchId === batch.id}
                          style={{ display: "inline-flex", alignItems: "center", gap: 7 }}
                        >
                          <RotateCcw size={13} />
                          {revertingBatchId === batch.id ? "Reverting..." : "Revert batch"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {step === "preview" && preview ? (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <FileSpreadsheet size={14} style={{ color: "var(--text-secondary)" }} />
                <span style={{ fontWeight: 600 }}>{fileName}</span>
                <span className="badge badge-blue">SiteCapture</span>
              </div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                <span style={{ color: "var(--green)", fontWeight: 600 }}>{validCount} row{validCount !== 1 ? "s" : ""}</span>
                {" "}ready
                {skippedCount > 0 ? (
                  <span style={{ color: "#dc2626", marginLeft: 10, fontWeight: 600 }}>
                    {skippedCount} skipped
                  </span>
                ) : null}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-outline" onClick={reset} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <X size={13} /> Back
              </button>
              <button className="btn btn-primary" onClick={handleConfirm} disabled={loading || validCount === 0}>
                {loading
                  ? "Processing..."
                  : preview.importType === "event"
                    ? `Apply ${validCount} SiteCapture event${validCount !== 1 ? "s" : ""}`
                    : mode === "import"
                      ? `Import ${validCount} SiteCapture row${validCount !== 1 ? "s" : ""}`
                      : `Update ${validCount} SiteCapture row${validCount !== 1 ? "s" : ""}`}
              </button>
            </div>
          </div>

          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Source row</th>
                    <th>Job #</th>
                    <th>Customer</th>
                    <th>Address</th>
                    <th>{isEventPreview ? "Review" : "CRM status"}</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row, index) => {
                    const isSkipped = row.previewStatus !== "valid" && row.previewStatus !== "matched";
                    return (
                      <tr key={`${row.jobNumber}-${index}`} style={{ background: isSkipped ? "#fff5f5" : undefined, opacity: isSkipped ? 0.78 : 1 }}>
                        <td>{renderStatusPill(mode, row)}</td>
                        <td><span className="mono" style={{ color: "var(--text-tertiary)" }}>{row.sourceRow}</span></td>
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
      ) : null}

      {step === "done" && results ? (
        <div style={{ maxWidth: 640 }}>
          <div className="card" style={{ padding: 28, marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
              <CheckCircle2 size={28} style={{ color: "var(--green)", flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 17 }}>
                  {results.importType === "event"
                    ? "SiteCapture event update complete"
                    : mode === "import"
                      ? "SiteCapture import complete"
                      : "SiteCapture update complete"}
                </div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>
                  {fileName}
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: results.failed.length ? 20 : 0 }}>
              {[
                { label: "Rows processed", value: results.total, color: "var(--text-primary)" },
                {
                  label: results.importType === "event" ? "Applied" : mode === "import" ? "Imported" : "Updated",
                  value: results.succeeded,
                  color: "var(--green)",
                },
                { label: "Skipped", value: results.failed.length, color: results.failed.length ? "#dc2626" : "var(--text-tertiary)" },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background: "var(--surface-2)", borderRadius: "var(--radius-md)", padding: "12px 14px" }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color, letterSpacing: "-0.02em" }}>{value}</div>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em" }}>{label}</div>
                </div>
              ))}
            </div>

            {results.batch ? (
              <div style={{ border: "1px solid #fde68a", background: "#fffbeb", borderRadius: "var(--radius-md)", padding: "14px 16px", marginBottom: results.failed.length ? 20 : 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#92400e" }}>Need to back this out?</div>
                    <div style={{ fontSize: 12, color: "#78350f", marginTop: 4 }}>
                      Revert batch deletes the jobs created by this import batch and their attached history. It does not undo update-mode imports.
                    </div>
                  </div>
                  <button
                    className="btn btn-outline"
                    onClick={() => handleRevert(results.batch.id)}
                    disabled={revertingBatchId === results.batch.id}
                    style={{ display: "inline-flex", alignItems: "center", gap: 7 }}
                  >
                    <RotateCcw size={13} />
                    {revertingBatchId === results.batch.id ? "Reverting..." : "Revert this import"}
                  </button>
                </div>
              </div>
            ) : null}

            {results.failed.length > 0 ? (
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
                      {item.customer ? <span style={{ color: "var(--text-secondary)", flexShrink: 0 }}>{item.customer}</span> : null}
                      <span style={{ color: "#dc2626" }}>{item.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href="/jobs" className="btn btn-primary">View jobs</Link>
            <button className="btn btn-outline" onClick={reset}>
              {results.importType === "event"
                ? "Apply another SiteCapture event file"
                : mode === "import"
                  ? "Import another SiteCapture file"
                  : "Update another SiteCapture file"}
            </button>
            <Link href="/import" className="btn btn-outline">Open standard importer</Link>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
