"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import { useUserRole } from "@/lib/useUserRole";
import { ArrowLeft, AlertCircle } from "lucide-react";

const INVOICE_TYPES = ["M1", "M2", "ADDER", "SPECIAL"];

function FormField({ label, children, span = 1, hint = "" }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6, gridColumn: span > 1 ? `span ${span}` : undefined }}>
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

  const jobId = searchParams.get("jobId");
  const typeParam = searchParams.get("type");

  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    if (!jobId) { setError("Job ID is required"); setLoading(false); return; }
    async function loadJob() {
      try {
        const res = await fetch(`/api/v2/jobs/${jobId}`);
        if (!res.ok) throw new Error("Job not found");
        const data = await res.json();
        setJob(data.job);
        const invoicesRes = await fetch(`/api/v2/jobs/${jobId}/invoices`);
        if (invoicesRes.ok) {
          const invoices = await invoicesRes.json();
          const type = typeParam || "M1";
          const existing = invoices.find((inv) => inv.invoiceType === type);
          if (existing) setError(`${type} invoice already exists for this job`);
        }
      } catch (err) {
        setError(err.message || "Failed to load job");
      } finally {
        setLoading(false);
      }
    }
    loadJob();
  }, [jobId, typeParam]);

  useEffect(() => {
    if (!roleLoading && !isOwner) router.replace("/");
  }, [roleLoading, isOwner, router]);

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage({ type: "", text: "" });
    if (!jobId) { setMessage({ type: "error", text: "Job ID is required" }); return; }
    if (!form.invoiceNumber.trim()) { setMessage({ type: "error", text: "Invoice number is required" }); return; }
    if (!form.amount || parseFloat(form.amount) <= 0) { setMessage({ type: "error", text: "Amount must be greater than 0" }); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/v2/jobs/${jobId}/invoices`, {
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
        <p>{job ? `${job.customerName} • Job ${job.jobNumber}` : "Loading job details..."}</p>
      </div>

      {error && (
        <div style={{ padding: "12px 16px", marginBottom: 16, borderRadius: "var(--radius-lg)", background: "var(--red-bg)", border: "1px solid var(--red)", color: "var(--red-text)", fontSize: 13 }}>
          {error}
        </div>
      )}

      {message.text && (
        <div style={{ padding: "12px 16px", marginBottom: 16, borderRadius: "var(--radius-lg)", background: message.type === "success" ? "var(--green-bg)" : message.type === "error" ? "var(--red-bg)" : "var(--surface-2)", border: message.type === "success" ? "1px solid var(--green)" : message.type === "error" ? "1px solid var(--red)" : "1px solid var(--border)", color: message.type === "success" ? "var(--green-text)" : message.type === "error" ? "var(--red-text)" : "var(--text-secondary)", fontSize: 13 }}>
          {message.text}
        </div>
      )}

      <div style={{ maxWidth: 600 }}>
        <div className="card card-elevated">
          <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
            <FormField label="Invoice type">
              <select value={form.invoiceType} onChange={(e) => setForm((prev) => ({ ...prev, invoiceType: e.target.value }))} disabled={!!typeParam}>
                {INVOICE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
              {typeParam && <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>Type specified in request</span>}
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
              <input value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} placeholder="e.g., Milestone 1 - Equipment and labor" />
            </FormField>

            <FormField label="Memo (internal notes)">
              <textarea value={form.memo} onChange={(e) => setForm((prev) => ({ ...prev, memo: e.target.value }))} placeholder="Optional internal notes" style={{ minHeight: 80, fontFamily: "var(--font-mono)", fontSize: 13 }} />
            </FormField>

            <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
              <button className="btn btn-primary" type="submit" disabled={submitting || !!error}>
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
