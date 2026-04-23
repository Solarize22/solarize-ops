"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import { useUserRole } from "@/lib/useUserRole";
import { ArrowLeft, AlertCircle } from "lucide-react";

const INVOICE_TYPES = ["M1", "M2", "ADDER", "SPECIAL"];

function FormField({ label, children, hint = "" }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".05em" }}>
        {label}
      </span>
      {children}
      {hint ? <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{hint}</span> : null}
    </label>
  );
}

function CreateInvoiceForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { loading: roleLoading, isOwner } = useUserRole();

  const jobIdParam = searchParams.get("jobId");
  const typeParam = searchParams.get("type");

  const [allJobs, setAllJobs] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState(jobIdParam || "");
  const [job, setJob] = useState(null);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState({ type: "", text: "" });
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    invoiceType: typeParam || "M1",
    invoiceNumber: "",
    amount: "",
    issuedAt: new Date().toISOString().slice(0, 10),
    dueAt: "",
    description: "",
    memo: "",
  });

  // Load all active jobs for the dropdown
  useEffect(() => {
    fetch("/api/v2/jobs")
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setAllJobs(Array.isArray(data) ? data : (data.jobs || [])))
      .catch(() => setAllJobs([]))
      .finally(() => setLoadingJobs(false));
  }, []);

  // Load selected job details + check for existing invoices
  useEffect(() => {
    if (!selectedJobId) { setJob(null); setError(""); return; }
    setError("");
    fetch(`/api/v2/jobs/${selectedJobId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data) return;
        setJob(data.job);
        return fetch(`/api/v2/jobs/${selectedJobId}/invoices`);
      })
      .then((r) => r && r.ok ? r.json() : null)
      .then((invoices) => {
        if (!invoices) return;
        const type = form.invoiceType;
        const existing = invoices.find((inv) => inv.invoiceType === type);
        if (existing) setError(`A ${type} invoice already exists for this job`);
      })
      .catch(() => {});
  }, [selectedJobId, form.invoiceType]);

  useEffect(() => {
    if (!roleLoading && !isOwner) router.replace("/");
  }, [roleLoading, isOwner, router]);

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage({ type: "", text: "" });
    if (!selectedJobId) { setMessage({ type: "error", text: "Please select a job" }); return; }
    if (!form.invoiceNumber.trim()) { setMessage({ type: "error", text: "Invoice number is required" }); return; }
    if (!form.amount || parseFloat(form.amount) <= 0) { setMessage({ type: "error", text: "Amount must be greater than 0" }); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/v2/jobs/${selectedJobId}/invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceType: form.invoiceType,
          invoiceNumber: form.invoiceNumber,
          amount: parseFloat(form.amount),
          issuedAt: form.issuedAt || undefined,
          dueAt: form.dueAt || undefined,
          description: form.description || undefined,
          memo: form.memo || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to create invoice");
      if (data.invoiceId) router.push(`/invoices/${data.invoiceId}`);
      else router.push("/invoices");
    } catch (err) {
      setMessage({ type: "error", text: err.message || "Failed to create invoice" });
      setSubmitting(false);
    }
  }

  if (roleLoading) {
    return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300, color: "var(--text-tertiary)" }}>Loading...</div>;
  }

  if (!isOwner) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 300, gap: 12, color: "var(--text-tertiary)" }}>
        <AlertCircle size={32} />
        <div style={{ fontWeight: 600, color: "var(--text-secondary)" }}>Access restricted</div>
        <div style={{ fontSize: 13 }}>Invoice creation is only available to owners.</div>
      </div>
    );
  }

  return (
    <>
      <div style={{ marginBottom: 20 }}>
        <button onClick={() => router.back()} style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", padding: 0, fontSize: 14 }}>
          <ArrowLeft size={16} /> Back
        </button>
      </div>

      <div className="page-header">
        <h1>Create invoice</h1>
        <p>{job ? `${job.customerName} • Job ${job.jobNumber}` : "Select a job to create an invoice"}</p>
      </div>

      {message.text && (
        <div style={{ padding: "12px 16px", marginBottom: 16, borderRadius: "var(--radius-lg)", background: message.type === "error" ? "var(--red-bg)" : "var(--green-bg)", border: `1px solid ${message.type === "error" ? "var(--red)" : "var(--green)"}`, color: message.type === "error" ? "var(--red-text)" : "var(--green-text)", fontSize: 13 }}>
          {message.text}
        </div>
      )}

      <div style={{ maxWidth: 600 }}>
        <div className="card card-elevated">
          <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>

            <FormField label="Job">
              <select
                value={selectedJobId}
                onChange={(e) => setSelectedJobId(e.target.value)}
                disabled={!!jobIdParam || loadingJobs}
              >
                <option value="">{loadingJobs ? "Loading jobs..." : "Select a job..."}</option>
                {allJobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.jobNumber} — {j.customerName}
                  </option>
                ))}
              </select>
            </FormField>

            {error && (
              <div style={{ padding: "10px 14px", borderRadius: "var(--radius-md)", background: "var(--red-bg)", border: "1px solid var(--red)", color: "var(--red-text)", fontSize: 13 }}>
                {error}
              </div>
            )}

            <FormField label="Invoice type">
              <select
                value={form.invoiceType}
                onChange={(e) => setForm((prev) => ({ ...prev, invoiceType: e.target.value }))}
                disabled={!!typeParam}
              >
                {INVOICE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </FormField>

            <FormField label="Invoice number">
              <input value={form.invoiceNumber} onChange={(e) => setForm((prev) => ({ ...prev, invoiceNumber: e.target.value }))} placeholder="e.g., INV-2026-001" required />
            </FormField>

            <FormField label="Amount (USD)">
              <input type="number" step="0.01" value={form.amount} onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))} placeholder="0.00" required />
            </FormField>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <FormField label="Issued date">
                <input type="date" value={form.issuedAt} onChange={(e) => setForm((prev) => ({ ...prev, issuedAt: e.target.value }))} />
              </FormField>
              <FormField label="Due date">
                <input type="date" value={form.dueAt} onChange={(e) => setForm((prev) => ({ ...prev, dueAt: e.target.value }))} />
              </FormField>
            </div>

            <FormField label="Description">
              <input value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} placeholder="e.g., Milestone 1 – Equipment and labor" />
            </FormField>

            <FormField label="Memo">
              <textarea value={form.memo} onChange={(e) => setForm((prev) => ({ ...prev, memo: e.target.value }))} placeholder="Internal notes" style={{ minHeight: 80, fontFamily: "var(--font-mono)", fontSize: 13 }} />
            </FormField>

            <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
              <button className="btn btn-primary" type="submit" disabled={submitting || !selectedJobId || !!error}>
                {submitting ? "Creating..." : "Create invoice"}
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => router.back()}>Cancel</button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

export default function CreateInvoicePage() {
  return (
    <AppShell>
      <Suspense fallback={<div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300, color: "var(--text-tertiary)" }}>Loading...</div>}>
        <CreateInvoiceForm />
      </Suspense>
    </AppShell>
  );
}
