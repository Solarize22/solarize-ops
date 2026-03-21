"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import { formatCurrency, formatDate, statusBadgeClass } from "@/lib/utils";
import { ArrowLeft, Calendar, DollarSign, FileText, ShieldCheck, Users } from "lucide-react";
import { useUserRole } from "@/lib/useUserRole";

const STATUS_OPTIONS = [
  "created",
  "scheduled",
  "install_completed",
  "inspection_scheduled",
  "inspection_passed",
  "inspection_failed",
  "pto_submitted",
  "pto_granted",
  "m1_invoiced",
  "m1_partially_paid",
  "m1_paid",
  "m2_invoiced",
  "m2_partially_paid",
  "paid_in_full",
  "on_hold",
  "cancelled",
];

const INVOICE_TYPES = ["M1", "M2", "ADDER", "SPECIAL"];
const PAYMENT_METHODS = ["ACH", "WIRE", "CHECK", "CREDIT_CARD", "FINANCER", "CASH", "OTHER"];

function Section({ title, icon: Icon, children, action = null }) {
  return (
    <div className="card" style={{ padding: "18px 20px", marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {Icon && <Icon size={14} style={{ color: "var(--text-secondary)" }} />}
          <div style={{ fontWeight: 600, fontSize: 13 }}>{title}</div>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, color: "var(--text-primary)" }}>{value || "—"}</div>
    </div>
  );
}

function EmptyState({ message }) {
  return <div className="empty-state" style={{ padding: "10px 0" }}>{message}</div>;
}

export default function JobDetailPage() {
  const { id } = useParams();
  const { isOwner, isAdmin, loading: roleLoading } = useUserRole();
  const [job, setJob] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);
  const [inspections, setInspections] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [statusForm, setStatusForm] = useState({ toStatus: "scheduled", effectiveDate: "", note: "" });
  const [invoiceForm, setInvoiceForm] = useState({ invoiceType: "M1", invoiceNumber: "", amount: "", issuedAt: "", dueAt: "", description: "", memo: "" });
  const [paymentForm, setPaymentForm] = useState({ invoiceId: "", amount: "", paymentMethod: "ACH", receivedAt: "", paymentReference: "", notes: "" });
  const [actionState, setActionState] = useState({ status: "", invoice: "", payment: "", error: "" });
  const [editingJob, setEditingJob] = useState(false);
  const [jobForm, setJobForm] = useState(null);
  const canManageOps = isOwner || isAdmin;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const jobRes = await fetch(`/api/v2/jobs/${id}`);
        if (!jobRes.ok) {
          const data = await jobRes.json().catch(() => ({}));
          throw new Error(data.error || "Failed to load job");
        }

        const jobData = await jobRes.json();
        const [invoicesRes, inspectionsRes, historyRes, paymentsRes] = await Promise.all([
          fetch(`/api/v2/jobs/${id}/invoices`),
          fetch(`/api/v2/jobs/${id}/inspections`),
          fetch(`/api/v2/jobs/${id}/history`),
          isOwner ? fetch(`/api/v2/jobs/${id}/payments`) : Promise.resolve(null),
        ]);

        if (cancelled) return;

        setJob(jobData);
        setInvoices(invoicesRes?.ok ? await invoicesRes.json() : []);
        setInspections(inspectionsRes?.ok ? await inspectionsRes.json() : []);
        setHistory(historyRes?.ok ? await historyRes.json() : []);
        setPayments(paymentsRes?.ok ? await paymentsRes.json() : []);
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Failed to load job");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (id) load();
    return () => { cancelled = true; };
  }, [id, isOwner, refreshKey]);

  useEffect(() => {
    if (!job) return;
    setStatusForm((prev) => ({ ...prev, toStatus: job.currentStatus || "scheduled" }));
    setJobForm({
      customerName: job.customerName || "",
      customerPhone: job.customerPhone || "",
      customerEmail: job.customerEmail || "",
      address: {
        street1: job.address?.street1 || "",
        street2: job.address?.street2 || "",
        city: job.address?.city || "",
        state: job.address?.state || "",
        postalCode: job.address?.postalCode || "",
        county: job.address?.county || "",
      },
      contractType: job.contractType || "",
      financer: job.financer || "",
      contractor: job.contractor || "",
      partner: job.partner || "",
      utilityCompany: job.utilityCompany || "",
      systemSizeKw: job.systemSizeKw || "",
      panelCount: job.panelCount || "",
      wattPerPanel: job.wattPerPanel || "",
      inverter: job.inverter || "",
      module: job.module || "",
      battery: !!job.battery,
      roofType: job.roofType || "",
      contractSignedAt: job.contractSignedAt || "",
      siteSurveyAt: job.siteSurveyAt || "",
      installScheduledAt: job.installScheduledAt || "",
      installCompletedAt: job.installCompletedAt || "",
      ptoSubmittedAt: job.ptoSubmittedAt || "",
      ptoGrantedAt: job.ptoGrantedAt || "",
      notes: job.notes || "",
    });
  }, [job?.currentStatus]);

  useEffect(() => {
    if (!paymentForm.invoiceId && invoices.length > 0) {
      const firstOpen = invoices.find((invoice) => (invoice.balanceCents || 0) > 0);
      if (firstOpen) {
        setPaymentForm((prev) => ({ ...prev, invoiceId: firstOpen.id }));
      }
    }
  }, [invoices, paymentForm.invoiceId]);

  const invoiceSummary = useMemo(() => {
    const total = invoices.reduce((sum, inv) => sum + (inv.totalCents || 0), 0);
    const outstanding = invoices.reduce((sum, inv) => sum + (inv.balanceCents || 0), 0);
    const paid = total - outstanding;
    return { total, outstanding, paid };
  }, [invoices]);

  if (loading || roleLoading) {
    return (
      <AppShell>
        <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--text-secondary)" }}>Loading job…</div>
      </AppShell>
    );
  }

  if (error || !job) {
    return (
      <AppShell>
        <div style={{ textAlign: "center", padding: "60px 20px" }}>
          <p style={{ color: "var(--text-secondary)", marginBottom: 12 }}>{error || "Job not found."}</p>
          <Link href="/jobs" style={{ color: "var(--text-primary)", fontSize: 13 }}>← Back to jobs</Link>
        </div>
      </AppShell>
    );
  }

  async function submitStatusTransition(e) {
    e.preventDefault();
    setActionState((prev) => ({ ...prev, error: "", status: "Saving..." }));
    try {
      const res = await fetch(`/api/v2/jobs/${id}/status-transitions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(statusForm),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to change status");
      setActionState((prev) => ({ ...prev, status: "Saved" }));
      setRefreshKey((v) => v + 1);
    } catch (err) {
      setActionState((prev) => ({ ...prev, error: err.message || "Failed to change status", status: "" }));
    }
  }

  async function submitInvoice(e) {
    e.preventDefault();
    setActionState((prev) => ({ ...prev, error: "", invoice: "Saving..." }));
    try {
      const res = await fetch(`/api/v2/jobs/${id}/invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(invoiceForm),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to create invoice");
      setInvoiceForm({ invoiceType: "M1", invoiceNumber: "", amount: "", issuedAt: "", dueAt: "", description: "", memo: "" });
      setActionState((prev) => ({ ...prev, invoice: "Saved" }));
      setRefreshKey((v) => v + 1);
    } catch (err) {
      setActionState((prev) => ({ ...prev, error: err.message || "Failed to create invoice", invoice: "" }));
    }
  }

  async function submitPayment(e) {
    e.preventDefault();
    setActionState((prev) => ({ ...prev, error: "", payment: "Saving..." }));
    try {
      const res = await fetch("/api/v2/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(paymentForm),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to record payment");
      setPaymentForm({ invoiceId: "", amount: "", paymentMethod: "ACH", receivedAt: "", paymentReference: "", notes: "" });
      setActionState((prev) => ({ ...prev, payment: "Saved" }));
      setRefreshKey((v) => v + 1);
    } catch (err) {
      setActionState((prev) => ({ ...prev, error: err.message || "Failed to record payment", payment: "" }));
    }
  }

  async function submitJobUpdate(e) {
    e.preventDefault();
    setActionState((prev) => ({ ...prev, error: "", status: "Saving..." }));
    try {
      const res = await fetch(`/api/v2/jobs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(jobForm),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to update job");
      setEditingJob(false);
      setActionState((prev) => ({ ...prev, status: "Saved" }));
      setRefreshKey((v) => v + 1);
    } catch (err) {
      setActionState((prev) => ({ ...prev, error: err.message || "Failed to update job", status: "" }));
    }
  }

  return (
    <AppShell>
      <div style={{ marginBottom: 16 }}>
        <Link href="/jobs" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--text-secondary)", textDecoration: "none", marginBottom: 10 }}>
          <ArrowLeft size={13} /> Back to jobs
        </Link>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
              <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em" }}>{job.customerName}</h1>
              <span className="mono badge badge-slate">{job.jobNumber}</span>
              <span className={`badge ${statusBadgeClass(job.currentStatus)}`}>{job.currentStatus}</span>
            </div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              {[job.address?.street1, job.address?.city, job.address?.state, job.address?.postalCode].filter(Boolean).join(", ")}
            </div>
          </div>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
            Normalized detail view
          </div>
        </div>
      </div>

      <Section title="Overview" icon={ShieldCheck}>
        {canManageOps && jobForm ? (
          <>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
              {!editingJob ? (
                <button className="btn btn-outline" onClick={() => setEditingJob(true)}>Edit Job</button>
              ) : null}
            </div>
            {editingJob ? (
              <form onSubmit={submitJobUpdate}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px 16px" }}>
                  <div style={{ gridColumn: "span 2" }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>Customer Name</div>
                    <input value={jobForm.customerName} onChange={(e) => setJobForm((prev) => ({ ...prev, customerName: e.target.value }))} />
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>Phone</div>
                    <input value={jobForm.customerPhone} onChange={(e) => setJobForm((prev) => ({ ...prev, customerPhone: e.target.value }))} />
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>Email</div>
                    <input value={jobForm.customerEmail} onChange={(e) => setJobForm((prev) => ({ ...prev, customerEmail: e.target.value }))} />
                  </div>
                  <div style={{ gridColumn: "span 2" }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>Street</div>
                    <input value={jobForm.address.street1} onChange={(e) => setJobForm((prev) => ({ ...prev, address: { ...prev.address, street1: e.target.value } }))} />
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>City</div>
                    <input value={jobForm.address.city} onChange={(e) => setJobForm((prev) => ({ ...prev, address: { ...prev.address, city: e.target.value } }))} />
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>State</div>
                    <input value={jobForm.address.state} onChange={(e) => setJobForm((prev) => ({ ...prev, address: { ...prev.address, state: e.target.value } }))} />
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>ZIP</div>
                    <input value={jobForm.address.postalCode} onChange={(e) => setJobForm((prev) => ({ ...prev, address: { ...prev.address, postalCode: e.target.value } }))} />
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>Financer</div>
                    <input value={jobForm.financer} onChange={(e) => setJobForm((prev) => ({ ...prev, financer: e.target.value }))} />
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>Utility</div>
                    <input value={jobForm.utilityCompany} onChange={(e) => setJobForm((prev) => ({ ...prev, utilityCompany: e.target.value }))} />
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>System Size</div>
                    <input type="number" step="0.01" value={jobForm.systemSizeKw} onChange={(e) => setJobForm((prev) => ({ ...prev, systemSizeKw: e.target.value }))} />
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>Panels</div>
                    <input type="number" value={jobForm.panelCount} onChange={(e) => setJobForm((prev) => ({ ...prev, panelCount: e.target.value }))} />
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>Inverter</div>
                    <input value={jobForm.inverter} onChange={(e) => setJobForm((prev) => ({ ...prev, inverter: e.target.value }))} />
                  </div>
                  <div style={{ gridColumn: "span 4" }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>Notes</div>
                    <textarea rows={4} value={jobForm.notes} onChange={(e) => setJobForm((prev) => ({ ...prev, notes: e.target.value }))} style={{ width: "100%", resize: "vertical" }} />
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button className="btn btn-outline" type="button" onClick={() => { setEditingJob(false); setRefreshKey((v) => v + 1); }}>Cancel</button>
                  <button className="btn btn-primary" type="submit">Save Job</button>
                </div>
              </form>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "14px 18px" }}>
                <Field label="Rep" value={job.repName} />
                <Field label="Crew" value={job.crewNames?.join(", ")} />
                <Field label="Financer" value={job.financer} />
                <Field label="Utility" value={job.utilityCompany} />
                <Field label="Contract Type" value={job.contractType} />
                <Field label="Contractor" value={job.contractor} />
                <Field label="Partner" value={job.partner} />
                <Field label="Battery" value={job.battery ? "Yes" : "No"} />
                <Field label="System Size" value={job.systemSizeKw ? `${job.systemSizeKw} kW` : null} />
                <Field label="Panels" value={job.panelCount} />
                <Field label="Inverter" value={job.inverter} />
                <Field label="Roof Type" value={job.roofType} />
              </div>
            )}
          </>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "14px 18px" }}>
            <Field label="Rep" value={job.repName} />
            <Field label="Crew" value={job.crewNames?.join(", ")} />
            <Field label="Financer" value={job.financer} />
            <Field label="Utility" value={job.utilityCompany} />
            <Field label="Contract Type" value={job.contractType} />
            <Field label="Contractor" value={job.contractor} />
            <Field label="Partner" value={job.partner} />
            <Field label="Battery" value={job.battery ? "Yes" : "No"} />
            <Field label="System Size" value={job.systemSizeKw ? `${job.systemSizeKw} kW` : null} />
            <Field label="Panels" value={job.panelCount} />
            <Field label="Inverter" value={job.inverter} />
            <Field label="Roof Type" value={job.roofType} />
          </div>
        )}
      </Section>

      <Section title="Milestones" icon={Calendar}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "14px 18px" }}>
          <Field label="Contract Signed" value={formatDate(job.contractSignedAt)} />
          <Field label="Site Survey" value={formatDate(job.siteSurveyAt)} />
          <Field label="Install Scheduled" value={formatDate(job.installScheduledAt)} />
          <Field label="Install Completed" value={formatDate(job.installCompletedAt)} />
          <Field label="PTO Submitted" value={formatDate(job.ptoSubmittedAt)} />
          <Field label="PTO Granted" value={formatDate(job.ptoGrantedAt)} />
          <Field label="Status Changed" value={formatDate(job.currentStatusChangedAt)} />
          <Field label="Updated" value={formatDate(job.updatedAt)} />
        </div>
      </Section>

      {canManageOps && (
        <Section title="Status Transition" icon={Calendar}>
          <form onSubmit={submitStatusTransition} style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 2fr auto", gap: 10, alignItems: "end" }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>Next Status</div>
              <select value={statusForm.toStatus} onChange={(e) => setStatusForm((prev) => ({ ...prev, toStatus: e.target.value }))}>
                {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>Effective Date</div>
              <input type="date" value={statusForm.effectiveDate} onChange={(e) => setStatusForm((prev) => ({ ...prev, effectiveDate: e.target.value }))} />
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>Note</div>
              <input value={statusForm.note} onChange={(e) => setStatusForm((prev) => ({ ...prev, note: e.target.value }))} placeholder="Optional reason or context" />
            </div>
            <button className="btn btn-primary" type="submit">Save</button>
          </form>
          {actionState.status && <div style={{ marginTop: 10, fontSize: 12, color: "var(--green)" }}>{actionState.status}</div>}
        </Section>
      )}

      <Section title="Invoices" icon={FileText}>
        <div className="stat-grid" style={{ marginBottom: 16 }}>
          <div className="stat-card">
            <div className="stat-label">Total invoiced</div>
            <div className="stat-value">{formatCurrency(invoiceSummary.total / 100)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Collected</div>
            <div className="stat-value" style={{ color: "var(--green)" }}>{formatCurrency(invoiceSummary.paid / 100)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Outstanding</div>
            <div className="stat-value" style={{ color: "var(--amber)" }}>{formatCurrency(invoiceSummary.outstanding / 100)}</div>
          </div>
        </div>
        {invoices.length === 0 ? (
          <EmptyState message="No invoice records yet." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Issued</th>
                  <th>Due</th>
                  <th>Total</th>
                  <th>Balance</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td><span className="mono badge badge-slate">{invoice.invoiceNumber}</span></td>
                    <td>{invoice.invoiceType}</td>
                    <td><span className={`badge ${statusBadgeClass(invoice.status === "partially_paid" ? "Pending" : invoice.status === "paid" ? "Paid" : "Pending")}`}>{invoice.status}</span></td>
                    <td>{formatDate(invoice.issuedAt)}</td>
                    <td>{formatDate(invoice.dueAt)}</td>
                    <td>{formatCurrency((invoice.totalCents || 0) / 100)}</td>
                    <td>{formatCurrency((invoice.balanceCents || 0) / 100)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {isOwner && (
          <form onSubmit={submitInvoice} style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1.2fr 0.9fr 1fr 1fr", gap: 10, alignItems: "end" }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>Type</div>
              <select value={invoiceForm.invoiceType} onChange={(e) => setInvoiceForm((prev) => ({ ...prev, invoiceType: e.target.value }))}>
                {INVOICE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>Invoice Number</div>
              <input value={invoiceForm.invoiceNumber} onChange={(e) => setInvoiceForm((prev) => ({ ...prev, invoiceNumber: e.target.value }))} placeholder="INV-3001" />
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>Amount</div>
              <input type="number" step="0.01" value={invoiceForm.amount} onChange={(e) => setInvoiceForm((prev) => ({ ...prev, amount: e.target.value }))} placeholder="0.00" />
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>Issued</div>
              <input type="date" value={invoiceForm.issuedAt} onChange={(e) => setInvoiceForm((prev) => ({ ...prev, issuedAt: e.target.value }))} />
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>Due</div>
              <input type="date" value={invoiceForm.dueAt} onChange={(e) => setInvoiceForm((prev) => ({ ...prev, dueAt: e.target.value }))} />
            </div>
            <div style={{ gridColumn: "1 / span 2" }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>Description</div>
              <input value={invoiceForm.description} onChange={(e) => setInvoiceForm((prev) => ({ ...prev, description: e.target.value }))} placeholder="Milestone 1" />
            </div>
            <div style={{ gridColumn: "3 / span 2" }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>Memo</div>
              <input value={invoiceForm.memo} onChange={(e) => setInvoiceForm((prev) => ({ ...prev, memo: e.target.value }))} placeholder="Optional memo" />
            </div>
            <button className="btn btn-primary" type="submit">Create Invoice</button>
          </form>
        )}
        {actionState.invoice && <div style={{ marginTop: 10, fontSize: 12, color: "var(--green)" }}>{actionState.invoice}</div>}
      </Section>

      {isOwner && (
        <Section title="Payments" icon={DollarSign}>
          {payments.length === 0 ? (
            <EmptyState message="No payment records yet." />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Method</th>
                    <th>Status</th>
                    <th>Received</th>
                    <th>Amount</th>
                    <th>Allocations</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => (
                    <tr key={payment.id}>
                      <td><span className="mono badge badge-slate">{payment.paymentReference || "—"}</span></td>
                      <td>{payment.paymentMethod}</td>
                      <td><span className={`badge ${statusBadgeClass(payment.status === "settled" ? "Paid" : payment.status === "failed" ? "Overdue" : "Pending")}`}>{payment.status}</span></td>
                      <td>{formatDate(payment.receivedAt)}</td>
                      <td>{formatCurrency((payment.amountCents || 0) / 100)}</td>
                      <td style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                        {payment.allocations?.length
                          ? payment.allocations.map((a) => `${a.invoiceNumber}: ${formatCurrency((a.allocatedCents || 0) / 100)}`).join(", ")
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {invoices.filter((invoice) => (invoice.balanceCents || 0) > 0).length > 0 && (
            <form onSubmit={submitPayment} style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1.2fr 0.8fr 1fr 1fr 1.2fr auto", gap: 10, alignItems: "end" }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>Invoice</div>
                <select value={paymentForm.invoiceId} onChange={(e) => setPaymentForm((prev) => ({ ...prev, invoiceId: e.target.value }))}>
                  <option value="">Select invoice</option>
                  {invoices.filter((invoice) => (invoice.balanceCents || 0) > 0).map((invoice) => (
                    <option key={invoice.id} value={invoice.id}>
                      {invoice.invoiceNumber} · {formatCurrency((invoice.balanceCents || 0) / 100)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>Amount</div>
                <input type="number" step="0.01" value={paymentForm.amount} onChange={(e) => setPaymentForm((prev) => ({ ...prev, amount: e.target.value }))} placeholder="0.00" />
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>Method</div>
                <select value={paymentForm.paymentMethod} onChange={(e) => setPaymentForm((prev) => ({ ...prev, paymentMethod: e.target.value }))}>
                  {PAYMENT_METHODS.map((method) => <option key={method} value={method}>{method}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>Received</div>
                <input type="date" value={paymentForm.receivedAt} onChange={(e) => setPaymentForm((prev) => ({ ...prev, receivedAt: e.target.value }))} />
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>Reference</div>
                <input value={paymentForm.paymentReference} onChange={(e) => setPaymentForm((prev) => ({ ...prev, paymentReference: e.target.value }))} placeholder="ACH ref, check #, etc." />
              </div>
              <button className="btn btn-primary" type="submit">Record Payment</button>
            </form>
          )}
          {actionState.payment && <div style={{ marginTop: 10, fontSize: 12, color: "var(--green)" }}>{actionState.payment}</div>}
        </Section>
      )}

      <Section title="Inspections" icon={Calendar}>
        {inspections.length === 0 ? (
          <EmptyState message="No inspection records yet." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Result</th>
                  <th>Scheduled</th>
                  <th>Completed</th>
                  <th>Authority</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {inspections.map((inspection) => (
                  <tr key={inspection.id}>
                    <td>{inspection.inspectionType}</td>
                    <td><span className={`badge ${statusBadgeClass(inspection.result === "passed" ? "Approved" : inspection.result === "failed" ? "Inspection Failed" : "Inspection Scheduled")}`}>{inspection.result}</span></td>
                    <td>{formatDate(inspection.scheduledAt)}</td>
                    <td>{formatDate(inspection.completedAt)}</td>
                    <td>{inspection.authorityName || "—"}</td>
                    <td style={{ fontSize: 12, color: "var(--text-secondary)" }}>{inspection.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Status History" icon={Users}>
        {history.length === 0 ? (
          <EmptyState message="No status history yet." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {history.map((item) => (
              <div key={item.id} style={{ padding: "12px 14px", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--surface-2)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span className="badge badge-slate">{item.eventType}</span>
                    <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      {item.fromStatus ? `${item.fromStatus} → ` : ""}{item.toStatus}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{formatDate(item.changedAt)}</div>
                </div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  {item.changedByName || "System"}{item.note ? ` · ${item.note}` : ""}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section
        title="Notes"
        action={<span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Editing will move to normalized write endpoints next</span>}
      >
        <div style={{ fontSize: 13, color: "var(--text-secondary)", whiteSpace: "pre-wrap", lineHeight: 1.7 }}>
          {job.notes || "No notes on this job."}
        </div>
        {actionState.error && <div style={{ marginTop: 12, fontSize: 12, color: "#dc2626" }}>{actionState.error}</div>}
      </Section>
    </AppShell>
  );
}
