"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import { formatCurrency, formatDate, formatDateTimeParts } from "@/lib/utils";
import { ArrowLeft, CalendarDays, CircleDollarSign, ClipboardList, ShieldCheck, Home } from "lucide-react";
import { useUserRole } from "@/lib/useUserRole";

const STATUS_OPTIONS = [
  "created", "scheduled", "install_completed", "inspection_scheduled",
  "inspection_passed", "inspection_failed", "pto_submitted", "pto_granted",
  "m1_invoiced", "m1_partially_paid", "m1_paid", "m2_invoiced",
  "m2_partially_paid", "paid_in_full", "on_hold", "cancelled",
];

const INVOICE_TYPES = ["M1", "M2", "ADDER", "SPECIAL"];
const PAYMENT_METHODS = ["ACH", "WIRE", "CHECK", "CREDIT_CARD", "FINANCER", "CASH", "OTHER"];

const STATUS_META = {
  created: { label: "Created", bg: "#f1f5f9", color: "#334155" },
  scheduled: { label: "Scheduled", bg: "#dbeafe", color: "#1d4ed8" },
  install_completed: { label: "Install complete", bg: "#dcfce7", color: "#166534" },
  inspection_scheduled: { label: "Inspection scheduled", bg: "#e0f2fe", color: "#075985" },
  inspection_passed: { label: "Inspection passed", bg: "#d1fae5", color: "#065f46" },
  inspection_failed: { label: "Inspection failed", bg: "#fee2e2", color: "#991b1b" },
  pto_submitted: { label: "PTO submitted", bg: "#fef3c7", color: "#92400e" },
  pto_granted: { label: "PTO granted", bg: "#ede9fe", color: "#6d28d9" },
  m1_invoiced: { label: "M1 invoiced", bg: "#ede9fe", color: "#6d28d9" },
  m1_partially_paid: { label: "M1 partial", bg: "#fef3c7", color: "#92400e" },
  m1_paid: { label: "M1 paid", bg: "#dcfce7", color: "#166534" },
  m2_invoiced: { label: "M2 invoiced", bg: "#ede9fe", color: "#6d28d9" },
  m2_partially_paid: { label: "M2 partial", bg: "#fef3c7", color: "#92400e" },
  paid_in_full: { label: "Paid in full", bg: "#111827", color: "#ffffff" },
  on_hold: { label: "On hold", bg: "#fee2e2", color: "#991b1b" },
  cancelled: { label: "Cancelled", bg: "#e5e7eb", color: "#4b5563" },
};

const TIMELINE = [
  { key: "created", label: "Created" },
  { key: "scheduled", label: "Scheduled" },
  { key: "install_completed", label: "Install complete" },
  { key: "inspection_scheduled", label: "Inspection" },
  { key: "pto_granted", label: "PTO" },
  { key: "m2_invoiced", label: "Final billing" },
  { key: "paid_in_full", label: "Paid" },
];

function statusMeta(status) {
  return STATUS_META[status] || STATUS_META.created;
}

function fieldValue(value) {
  return value || "-";
}

function nextAction(job) {
  switch (job.currentStatus) {
    case "created": return "Schedule the job";
    case "scheduled": return "Confirm install details";
    case "install_completed": return "Create M1 invoice";
    case "inspection_scheduled": return "Track inspection result";
    case "inspection_failed": return "Resolve failure and reschedule";
    case "inspection_passed": return "Push PTO";
    case "pto_submitted": return "Follow up with utility";
    case "pto_granted": return "Create M2 invoice";
    case "m1_invoiced":
    case "m1_partially_paid": return "Collect M1 payment";
    case "m1_paid": return "Move to final billing";
    case "m2_invoiced":
    case "m2_partially_paid": return "Collect M2 payment";
    case "on_hold": return "Review blocker";
    case "paid_in_full": return "Closed";
    case "cancelled": return "Cancelled";
    default: return "Review";
  }
}

function operationalDate(job) {
  return job.installScheduledAt || job.installCompletedAt || job.ptoGrantedAt || job.currentStatusChangedAt;
}

function MilestoneCard({ label, value, strong = false }) {
  return (
    <div style={{ padding: "12px 14px", borderRadius: "var(--radius-md)", background: strong ? "#f5ecdf" : "var(--surface-2)", border: strong ? "1px solid #e9d7bf" : "1px solid var(--border)" }}>
      <div style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 700 }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 14, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function DateTimeStack({ value, align = "left" }) {
  const parts = formatDateTimeParts(value);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: align === "right" ? "flex-end" : "flex-start", gap: 2 }}>
      <span>{parts.date}</span>
      {parts.time ? <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 }}>{parts.time}</span> : null}
    </div>
  );
}

function InfoGrid({ items }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "12px 14px" }}>
      {items.map((item) => (
        <div key={item.label} style={{ padding: "12px 14px", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--surface-2)" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 5 }}>{item.label}</div>
          <div style={{ fontSize: 13, color: "var(--text-primary)" }}>{item.value}</div>
        </div>
      ))}
    </div>
  );
}

function ActionPanel({ title, icon: Icon, children }) {
  return (
    <div className="card" style={{ padding: "18px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <Icon size={15} style={{ color: "#6c4b2e" }} />
        <div style={{ fontWeight: 800, fontSize: 14 }}>{title}</div>
      </div>
      {children}
    </div>
  );
}

function EmptyState({ text }) {
  return <div style={{ padding: "12px 0", fontSize: 13, color: "var(--text-secondary)" }}>{text}</div>;
}

function FormField({ label, children, span = 1, hint = "" }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6, gridColumn: span > 1 ? `span ${span}` : undefined }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".05em" }}>{label}</span>
      {children}
      {hint ? <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{hint}</span> : null}
    </label>
  );
}

function SectionHeading({ title, description = "" }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", color: "#6c4b2e" }}>{title}</div>
      {description ? <div style={{ marginTop: 3, fontSize: 12, color: "var(--text-secondary)" }}>{description}</div> : null}
    </div>
  );
}

function EventLabel({ item }) {
  if (item.eventType === "status_changed") return "Status updated";
  if (item.eventType === "invoice_created") return "Invoice created";
  if (item.eventType === "payment_received") return "Payment recorded";
  if (item.eventType === "note") return "Project record updated";
  return item.eventType?.replace(/_/g, " ") || "Activity";
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
  const [editingJob, setEditingJob] = useState(false);
  const [jobForm, setJobForm] = useState(null);
  const [statusForm, setStatusForm] = useState({ toStatus: "scheduled", effectiveDate: "", note: "" });
  const [invoiceForm, setInvoiceForm] = useState({ invoiceType: "M1", invoiceNumber: "", amount: "", issuedAt: "", dueAt: "", description: "", memo: "" });
  const [paymentForm, setPaymentForm] = useState({ invoiceId: "", amount: "", paymentMethod: "ACH", receivedAt: "", paymentReference: "", notes: "" });
  const [message, setMessage] = useState({ type: "", text: "" });
  const billingRef = useRef(null);
  const statusRef = useRef(null);
  const canManageOps = isOwner || isAdmin;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const detailRes = await fetch(`/api/v2/jobs/${id}/full`);
        const detailData = await detailRes.json().catch(() => ({}));
        if (!detailRes.ok) throw new Error(detailData.error || "Failed to load job");
        if (cancelled) return;
        setJob(detailData.job || null);
        setInvoices(Array.isArray(detailData.invoices) ? detailData.invoices : []);
        setInspections(Array.isArray(detailData.inspections) ? detailData.inspections : []);
        setHistory(Array.isArray(detailData.history) ? detailData.history : []);
        setPayments(Array.isArray(detailData.payments) ? detailData.payments : []);
      } catch (err) {
        if (!cancelled) setError(err.message || "Failed to load job");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (id) load();
    return () => { cancelled = true; };
  }, [id, refreshKey]);

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
      financer: job.financer || "",
      contractor: job.contractor || "",
      partner: job.partner || "",
      utilityCompany: job.utilityCompany || "",
      systemSizeKw: job.systemSizeKw || "",
      panelCount: job.panelCount || "",
      wattPerPanel: job.wattPerPanel || "",
      inverter: job.inverter || "",
      module: job.module || "",
      roofType: job.roofType || "",
      battery: !!job.battery,
      contractType: job.contractType || "",
      contractSignedAt: job.contractSignedAt || "",
      siteSurveyAt: job.siteSurveyAt || "",
      installScheduledAt: job.installScheduledAt || "",
      installCompletedAt: job.installCompletedAt || "",
      ptoSubmittedAt: job.ptoSubmittedAt || "",
      ptoGrantedAt: job.ptoGrantedAt || "",
      notes: job.notes || "",
    });
  }, [job]);

  useEffect(() => {
    if (!paymentForm.invoiceId && invoices.length > 0) {
      const openInvoice = invoices.find((invoice) => (invoice.balanceCents || 0) > 0);
      if (openInvoice) setPaymentForm((prev) => ({ ...prev, invoiceId: openInvoice.id }));
    }
  }, [invoices, paymentForm.invoiceId]);

  const invoiceSummary = useMemo(() => {
    const total = invoices.reduce((sum, item) => sum + (item.totalCents || 0), 0);
    const outstanding = invoices.reduce((sum, item) => sum + (item.balanceCents || 0), 0);
    return { total, outstanding, paid: total - outstanding };
  }, [invoices]);

  const highlightedInvoice = useMemo(() => invoices.find((invoice) => (invoice.balanceCents || 0) > 0) || invoices[0] || null, [invoices]);

  const quickActions = useMemo(() => {
    if (!job) return [];
    const today = new Date().toISOString().slice(0, 10);
    const actions = [];

    if (canManageOps && job.currentStatus === "created") {
      actions.push({ label: "Mark scheduled", kind: "status", toStatus: "scheduled", note: "Scheduled from command center", date: today });
    }
    if (canManageOps && job.currentStatus === "scheduled") {
      actions.push({ label: "Mark install complete", kind: "status", toStatus: "install_completed", note: "Install completed from command center", date: today });
    }
    if (["install_completed", "inspection_scheduled", "inspection_passed"].includes(job.currentStatus)) {
      actions.push({ label: "Prepare M1 invoice", kind: "invoice", invoiceType: "M1" });
    }
    if (canManageOps && job.currentStatus === "install_completed") {
      actions.push({ label: "Mark inspection scheduled", kind: "status", toStatus: "inspection_scheduled", note: "Inspection scheduled from command center", date: today });
    }
    if (canManageOps && ["inspection_scheduled", "inspection_failed"].includes(job.currentStatus)) {
      actions.push({ label: "Mark inspection passed", kind: "status", toStatus: "inspection_passed", note: "Inspection passed from command center", date: today });
    }
    if (canManageOps && ["inspection_passed", "pto_submitted"].includes(job.currentStatus)) {
      actions.push({ label: "Grant PTO", kind: "status", toStatus: "pto_granted", note: "PTO granted from command center", date: today });
    }
    if (["pto_granted", "m1_paid"].includes(job.currentStatus)) {
      actions.push({ label: "Prepare M2 invoice", kind: "invoice", invoiceType: "M2" });
    }
    if (isOwner && invoices.some((invoice) => (invoice.balanceCents || 0) > 0)) {
      actions.push({ label: "Record payment", kind: "payment" });
    }
    if (canManageOps && ["inspection_failed", "on_hold"].includes(job.currentStatus)) {
      actions.push({ label: "Move to on hold", kind: "status", toStatus: "on_hold", note: "Job placed on hold from command center", date: today });
    }

    return actions;
  }, [job, canManageOps, isOwner, invoices]);

  async function handleStatusSubmit(e) {
    e.preventDefault();
    setMessage({ type: "", text: "" });
    try {
      const res = await fetch(`/api/v2/jobs/${id}/status-transitions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(statusForm),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to save status");
      setMessage({ type: "success", text: "Status updated." });
      setRefreshKey((v) => v + 1);
    } catch (err) {
      setMessage({ type: "error", text: err.message || "Failed to save status" });
    }
  }

  async function handleInvoiceSubmit(e) {
    e.preventDefault();
    setMessage({ type: "", text: "" });
    try {
      const res = await fetch(`/api/v2/jobs/${id}/invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(invoiceForm),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to create invoice");
      setInvoiceForm({ invoiceType: "M1", invoiceNumber: "", amount: "", issuedAt: "", dueAt: "", description: "", memo: "" });
      setMessage({ type: "success", text: "Invoice created." });
      setRefreshKey((v) => v + 1);
    } catch (err) {
      setMessage({ type: "error", text: err.message || "Failed to create invoice" });
    }
  }

  async function handlePaymentSubmit(e) {
    e.preventDefault();
    setMessage({ type: "", text: "" });
    try {
      const res = await fetch("/api/v2/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(paymentForm),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to record payment");
      setPaymentForm({ invoiceId: "", amount: "", paymentMethod: "ACH", receivedAt: "", paymentReference: "", notes: "" });
      setMessage({ type: "success", text: "Payment recorded." });
      setRefreshKey((v) => v + 1);
    } catch (err) {
      setMessage({ type: "error", text: err.message || "Failed to record payment" });
    }
  }

  async function handleJobSave(e) {
    e.preventDefault();
    setMessage({ type: "", text: "" });
    try {
      const res = await fetch(`/api/v2/jobs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(jobForm),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to save job");
      setEditingJob(false);
      setMessage({ type: "success", text: "Job details updated." });
      setRefreshKey((v) => v + 1);
    } catch (err) {
      setMessage({ type: "error", text: err.message || "Failed to save job" });
    }
  }

  async function runQuickStatusAction(action) {
    setMessage({ type: "", text: "" });
    try {
      const res = await fetch(`/api/v2/jobs/${id}/status-transitions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toStatus: action.toStatus,
          effectiveDate: action.date,
          note: action.note,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to update status");
      setMessage({ type: "success", text: `${action.label} complete.` });
      setRefreshKey((v) => v + 1);
    } catch (err) {
      setMessage({ type: "error", text: err.message || "Failed to update status" });
    }
  }

  function runQuickInvoiceAction(action) {
    billingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setInvoiceForm((prev) => ({
      ...prev,
      invoiceType: action.invoiceType,
      issuedAt: prev.issuedAt || new Date().toISOString().slice(0, 10),
      description: action.invoiceType === "M1" ? "Milestone 1" : action.invoiceType === "M2" ? "Milestone 2" : prev.description,
    }));
    setMessage({ type: "success", text: `${action.invoiceType} form is ready below.` });
  }

  function runQuickPaymentAction() {
    billingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    const openInvoice = invoices.find((invoice) => (invoice.balanceCents || 0) > 0);
    setPaymentForm((prev) => ({
      ...prev,
      invoiceId: openInvoice?.id || prev.invoiceId,
      receivedAt: prev.receivedAt || new Date().toISOString().slice(0, 10),
      amount: openInvoice ? ((openInvoice.balanceCents || 0) / 100).toFixed(2) : prev.amount,
    }));
    setMessage({ type: "success", text: "Payment form is ready below." });
  }

  if (loading || roleLoading) return <AppShell><div style={{ padding: "60px 20px", textAlign: "center", color: "var(--text-secondary)" }}>Loading job...</div></AppShell>;
  if (error || !job) return <AppShell><div style={{ padding: "60px 20px", textAlign: "center" }}><div style={{ color: "var(--text-secondary)", marginBottom: 12 }}>{error || "Job not found."}</div><Link href="/jobs" style={{ color: "var(--text-primary)", textDecoration: "none" }}>Back to jobs</Link></div></AppShell>;

  const status = statusMeta(job.currentStatus);
  const timelineIndex = Math.max(0, TIMELINE.findIndex((item) => item.key === job.currentStatus));

  return (
    <AppShell>
      <div style={{ marginBottom: 18 }}>
        <Link href="/jobs" style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none", color: "var(--text-secondary)", fontSize: 12, marginBottom: 12 }}>
          <ArrowLeft size={13} /> Back to jobs
        </Link>

        <div className="card" style={{ padding: "22px 24px", background: "linear-gradient(135deg, #fff9f1 0%, #f8f2e9 100%)", border: "1px solid #eadfce" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.03em", margin: 0 }}>{job.customerName}</h1>
                <span className="mono badge badge-slate">{job.jobNumber}</span>
                <span style={{ padding: "5px 10px", borderRadius: 999, background: status.bg, color: status.color, fontSize: 12, fontWeight: 800 }}>{status.label}</span>
              </div>
              <div style={{ fontSize: 13, color: "#6c5a49", marginBottom: 8 }}>
                {[job.address?.street1, job.address?.city, job.address?.state, job.address?.postalCode].filter(Boolean).join(", ")}
              </div>
              <div style={{ fontSize: 14, color: "#4f3d2f" }}>Next action: <strong>{nextAction(job)}</strong></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(120px, 1fr))", gap: 10, minWidth: 360 }}>
              <MilestoneCard label="Current stage" value={status.label} strong />
              <MilestoneCard label="Next date" value={<DateTimeStack value={operationalDate(job)} />} />
              <MilestoneCard label="Outstanding" value={isOwner ? formatCurrency((job.financialSummary?.outstandingCents || 0) / 100) : "Hidden"} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 10, marginTop: 18 }}>
            {TIMELINE.map((item, index) => {
              const active = index <= timelineIndex;
              return <div key={item.key} style={{ padding: "10px 12px", borderRadius: "var(--radius-md)", background: active ? "#1f1a17" : "rgba(255,255,255,.7)", color: active ? "#fff" : "#6b7280", border: active ? "none" : "1px solid #eadfce", fontSize: 12, fontWeight: 700, textAlign: "center" }}>{item.label}</div>;
            })}
          </div>
        </div>
      </div>

      {message.text ? <div style={{ marginBottom: 14, padding: "10px 12px", borderRadius: "var(--radius-md)", background: message.type === "error" ? "#fee2e2" : "#dcfce7", color: message.type === "error" ? "#991b1b" : "#166534", fontSize: 13, fontWeight: 600 }}>{message.text}</div> : null}

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 16, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <ActionPanel title="Project snapshot" icon={Home}>
            {editingJob && canManageOps && jobForm ? (
              <form onSubmit={handleJobSave}>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 12 }}>
                  Update the core project record. Blank date fields are allowed and will stay empty.
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
                  <FormField label="Customer name">
                    <input value={jobForm.customerName} onChange={(e) => setJobForm((prev) => ({ ...prev, customerName: e.target.value }))} />
                  </FormField>
                  <FormField label="Customer phone">
                    <input value={jobForm.customerPhone} onChange={(e) => setJobForm((prev) => ({ ...prev, customerPhone: e.target.value }))} />
                  </FormField>
                  <FormField label="Customer email">
                    <input value={jobForm.customerEmail} onChange={(e) => setJobForm((prev) => ({ ...prev, customerEmail: e.target.value }))} />
                  </FormField>
                  <FormField label="Financer">
                    <input value={jobForm.financer} onChange={(e) => setJobForm((prev) => ({ ...prev, financer: e.target.value }))} />
                  </FormField>
                  <FormField label="Contractor">
                    <input value={jobForm.contractor} onChange={(e) => setJobForm((prev) => ({ ...prev, contractor: e.target.value }))} />
                  </FormField>
                  <FormField label="Build partner">
                    <input value={jobForm.partner} onChange={(e) => setJobForm((prev) => ({ ...prev, partner: e.target.value }))} />
                  </FormField>
                  <FormField label="Street address">
                    <input value={jobForm.address.street1} onChange={(e) => setJobForm((prev) => ({ ...prev, address: { ...prev.address, street1: e.target.value } }))} />
                  </FormField>
                  <FormField label="Address line 2">
                    <input value={jobForm.address.street2} onChange={(e) => setJobForm((prev) => ({ ...prev, address: { ...prev.address, street2: e.target.value } }))} />
                  </FormField>
                  <FormField label="City">
                    <input value={jobForm.address.city} onChange={(e) => setJobForm((prev) => ({ ...prev, address: { ...prev.address, city: e.target.value } }))} />
                  </FormField>
                  <FormField label="State">
                    <input value={jobForm.address.state} onChange={(e) => setJobForm((prev) => ({ ...prev, address: { ...prev.address, state: e.target.value } }))} />
                  </FormField>
                  <FormField label="ZIP code">
                    <input value={jobForm.address.postalCode} onChange={(e) => setJobForm((prev) => ({ ...prev, address: { ...prev.address, postalCode: e.target.value } }))} />
                  </FormField>
                  <FormField label="County">
                    <input value={jobForm.address.county} onChange={(e) => setJobForm((prev) => ({ ...prev, address: { ...prev.address, county: e.target.value } }))} />
                  </FormField>
                  <FormField label="Utility company">
                    <input value={jobForm.utilityCompany} onChange={(e) => setJobForm((prev) => ({ ...prev, utilityCompany: e.target.value }))} />
                  </FormField>
                  <FormField label="Contract type">
                    <input value={jobForm.contractType} onChange={(e) => setJobForm((prev) => ({ ...prev, contractType: e.target.value }))} />
                  </FormField>
                  <FormField label="System size (kW)">
                    <input value={jobForm.systemSizeKw} onChange={(e) => setJobForm((prev) => ({ ...prev, systemSizeKw: e.target.value }))} />
                  </FormField>
                  <FormField label="Panel count">
                    <input value={jobForm.panelCount} onChange={(e) => setJobForm((prev) => ({ ...prev, panelCount: e.target.value }))} />
                  </FormField>
                  <FormField label="Watt per panel">
                    <input value={jobForm.wattPerPanel} onChange={(e) => setJobForm((prev) => ({ ...prev, wattPerPanel: e.target.value }))} />
                  </FormField>
                  <FormField label="Inverter">
                    <input value={jobForm.inverter} onChange={(e) => setJobForm((prev) => ({ ...prev, inverter: e.target.value }))} />
                  </FormField>
                  <FormField label="Module">
                    <input value={jobForm.module} onChange={(e) => setJobForm((prev) => ({ ...prev, module: e.target.value }))} />
                  </FormField>
                  <FormField label="Roof type">
                    <input value={jobForm.roofType} onChange={(e) => setJobForm((prev) => ({ ...prev, roofType: e.target.value }))} />
                  </FormField>
                  <FormField label="Battery">
                    <label style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 40, fontSize: 13, color: "var(--text-secondary)" }}>
                      <input type="checkbox" checked={jobForm.battery} onChange={(e) => setJobForm((prev) => ({ ...prev, battery: e.target.checked }))} />
                      Battery included
                    </label>
                  </FormField>
                  <div />
                  <FormField label="Contract signed date" hint="MM/DD/YYYY in display, standard date picker in edit mode.">
                    <input type="date" value={jobForm.contractSignedAt} onChange={(e) => setJobForm((prev) => ({ ...prev, contractSignedAt: e.target.value }))} />
                  </FormField>
                  <FormField label="Site survey date">
                    <input type="date" value={jobForm.siteSurveyAt} onChange={(e) => setJobForm((prev) => ({ ...prev, siteSurveyAt: e.target.value }))} />
                  </FormField>
                  <FormField label="Install scheduled date">
                    <input type="date" value={jobForm.installScheduledAt} onChange={(e) => setJobForm((prev) => ({ ...prev, installScheduledAt: e.target.value }))} />
                  </FormField>
                  <FormField label="Install completed date">
                    <input type="date" value={jobForm.installCompletedAt} onChange={(e) => setJobForm((prev) => ({ ...prev, installCompletedAt: e.target.value }))} />
                  </FormField>
                  <FormField label="PTO submitted date">
                    <input type="date" value={jobForm.ptoSubmittedAt} onChange={(e) => setJobForm((prev) => ({ ...prev, ptoSubmittedAt: e.target.value }))} />
                  </FormField>
                  <FormField label="PTO granted date">
                    <input type="date" value={jobForm.ptoGrantedAt} onChange={(e) => setJobForm((prev) => ({ ...prev, ptoGrantedAt: e.target.value }))} />
                  </FormField>
                  <FormField label="Internal notes" span={2} hint="Project notes for ops, billing, and follow-up context.">
                    <textarea rows={4} value={jobForm.notes} onChange={(e) => setJobForm((prev) => ({ ...prev, notes: e.target.value }))} style={{ resize: "vertical" }} />
                  </FormField>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button className="btn btn-outline" type="button" onClick={() => setEditingJob(false)}>Cancel</button>
                  <button className="btn btn-primary" type="submit">Save details</button>
                </div>
              </form>
            ) : (
              <>
                <SectionHeading title="Project profile" description="Core identity, crew, and system information for this install." />
                <SectionHeading title="Homeowner" description="Who the job belongs to and where the crew is going." />
                <InfoGrid items={[
                  { label: "Homeowner", value: fieldValue(job.customerName) },
                  { label: "Phone", value: fieldValue(job.customerPhone) },
                  { label: "Email", value: fieldValue(job.customerEmail) },
                  { label: "Address", value: fieldValue([job.address?.street1, job.address?.street2].filter(Boolean).join(", ")) },
                  { label: "City / State / ZIP", value: fieldValue([job.address?.city, job.address?.state, job.address?.postalCode].filter(Boolean).join(", ")) },
                  { label: "County", value: fieldValue(job.address?.county) },
                ]} />

                <div style={{ marginTop: 16 }}>
                  <SectionHeading title="System details" description="Equipment and system configuration the field team needs to know." />
                  <InfoGrid items={[
                    { label: "Module", value: fieldValue(job.module) },
                    { label: "Panels", value: fieldValue(job.panelCount) },
                    { label: "System size", value: job.systemSizeKw ? `${job.systemSizeKw} kW` : "-" },
                    { label: "Watt per panel", value: job.wattPerPanel ? `${job.wattPerPanel} W` : "-" },
                    { label: "Inverter", value: fieldValue(job.inverter) },
                    { label: "Battery", value: job.battery ? "Yes" : "No" },
                    { label: "Roof type", value: fieldValue(job.roofType) },
                  ]} />
                </div>

                <div style={{ marginTop: 16 }}>
                  <SectionHeading title="Job details" description="Commercial and partner details that affect the workflow." />
                  <InfoGrid items={[
                    { label: "Contract type", value: fieldValue(job.contractType) },
                    { label: "Financer", value: fieldValue(job.financer) },
                    { label: "Utility", value: fieldValue(job.utilityCompany) },
                    { label: "Contractor", value: fieldValue(job.contractor) },
                    { label: "Build partner", value: fieldValue(job.partner) },
                    { label: "Rep", value: fieldValue(job.repName) },
                  ]} />
                </div>

                <div style={{ marginTop: 16, padding: "12px 14px", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--surface-2)" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>Internal notes</div>
                  <div style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{job.notes || "No notes yet."}</div>
                </div>

                {canManageOps ? <div style={{ marginTop: 12 }}><button className="btn btn-outline" onClick={() => setEditingJob(true)}>Edit job details</button></div> : null}
              </>
            )}
          </ActionPanel>

          <ActionPanel title="Milestone dates" icon={CalendarDays}>
            <SectionHeading title="Operational timeline" description="Key dates that drive install, PTO, and billing readiness." />
            <InfoGrid items={[
              { label: "Contract signed", value: formatDate(job.contractSignedAt) },
              { label: "Site survey", value: formatDate(job.siteSurveyAt) },
              { label: "Install scheduled", value: formatDate(job.installScheduledAt) },
              { label: "Install completed", value: formatDate(job.installCompletedAt) },
              { label: "PTO submitted", value: formatDate(job.ptoSubmittedAt) },
              { label: "PTO granted", value: formatDate(job.ptoGrantedAt) },
            ]} />
          </ActionPanel>

          <ActionPanel title="Install" icon={Home}>
            <SectionHeading title="Install tracking" description="Crew ownership and install completion details for the field team." />
            <InfoGrid items={[
              { label: "Scheduled date", value: formatDate(job.installScheduledAt) },
              { label: "Completed date", value: formatDate(job.installCompletedAt) },
              { label: "Crew", value: fieldValue(job.crewNames?.join(", ")) },
              { label: "Homeowner", value: fieldValue(job.customerName) },
              { label: "Current status", value: status.label },
              { label: "Next action", value: nextAction(job) },
            ]} />
          </ActionPanel>

          <ActionPanel title="Inspection" icon={ClipboardList}>
            <SectionHeading title="Inspection tracking" description="Scheduling, results, authority details, and follow-up notes." />
            {inspections.length > 0 ? (
              <div className="table-wrap" style={{ marginBottom: 14 }}>
                <table><thead><tr><th>Type</th><th>Result</th><th>Scheduled</th><th>Completed</th><th>Authority</th><th>Inspector</th></tr></thead><tbody>
                  {inspections.map((inspection) => <tr key={inspection.id}><td>{inspection.inspectionType}</td><td>{inspection.result}</td><td>{formatDate(inspection.scheduledAt)}</td><td>{formatDate(inspection.completedAt)}</td><td>{fieldValue(inspection.authorityName)}</td><td>{fieldValue(inspection.inspectorName)}</td></tr>)}
                </tbody></table>
              </div>
            ) : <EmptyState text="No inspection records yet." />}
          </ActionPanel>

          <div ref={billingRef}>
          <ActionPanel title="Financials" icon={CircleDollarSign}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, marginBottom: 14 }}>
              <MilestoneCard label="Invoiced" value={formatCurrency(invoiceSummary.total / 100)} />
              <MilestoneCard label="Collected" value={formatCurrency(invoiceSummary.paid / 100)} />
              <MilestoneCard label="Outstanding" value={formatCurrency(invoiceSummary.outstanding / 100)} strong />
            </div>
            {highlightedInvoice ? (
              <div style={{ padding: "12px 14px", border: "1px solid #eadfce", borderRadius: "var(--radius-md)", background: "#fffdf9", marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 6 }}>
                  <div style={{ fontWeight: 800 }}>{highlightedInvoice.invoiceNumber}</div>
                  <span className="mono badge badge-slate">{highlightedInvoice.invoiceType}</span>
                </div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Issued {formatDate(highlightedInvoice.issuedAt)} | Due {formatDate(highlightedInvoice.dueAt)} | Balance {formatCurrency((highlightedInvoice.balanceCents || 0) / 100)}</div>
              </div>
            ) : <EmptyState text="No invoice records yet." />}
            {invoices.length > 0 ? (
              <div className="table-wrap" style={{ marginBottom: 14 }}>
                <table><thead><tr><th>Invoice</th><th>Type</th><th>Status</th><th>Issued</th><th>Total</th><th>Balance</th></tr></thead><tbody>
                  {invoices.map((invoice) => <tr key={invoice.id}><td><span className="mono badge badge-slate">{invoice.invoiceNumber}</span></td><td>{invoice.invoiceType}</td><td>{invoice.status}</td><td>{formatDate(invoice.issuedAt)}</td><td>{formatCurrency((invoice.totalCents || 0) / 100)}</td><td>{formatCurrency((invoice.balanceCents || 0) / 100)}</td></tr>)}
                </tbody></table>
              </div>
            ) : null}
            {isOwner ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <form onSubmit={handleInvoiceSubmit} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 14 }}>
                  <div style={{ fontWeight: 700, marginBottom: 10 }}>Create invoice</div>
                  <div style={{ display: "grid", gap: 10 }}>
                    <select value={invoiceForm.invoiceType} onChange={(e) => setInvoiceForm((prev) => ({ ...prev, invoiceType: e.target.value }))}>{INVOICE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select>
                    <input value={invoiceForm.invoiceNumber} onChange={(e) => setInvoiceForm((prev) => ({ ...prev, invoiceNumber: e.target.value }))} placeholder="Invoice number" />
                    <input type="number" step="0.01" value={invoiceForm.amount} onChange={(e) => setInvoiceForm((prev) => ({ ...prev, amount: e.target.value }))} placeholder="Amount" />
                    <input type="date" value={invoiceForm.issuedAt} onChange={(e) => setInvoiceForm((prev) => ({ ...prev, issuedAt: e.target.value }))} />
                    <input type="date" value={invoiceForm.dueAt} onChange={(e) => setInvoiceForm((prev) => ({ ...prev, dueAt: e.target.value }))} />
                    <input value={invoiceForm.description} onChange={(e) => setInvoiceForm((prev) => ({ ...prev, description: e.target.value }))} placeholder="Description" />
                    <button className="btn btn-primary" type="submit">Create invoice</button>
                  </div>
                </form>
                <form onSubmit={handlePaymentSubmit} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 14 }}>
                  <div style={{ fontWeight: 700, marginBottom: 10 }}>Record payment</div>
                  <div style={{ display: "grid", gap: 10 }}>
                    <select value={paymentForm.invoiceId} onChange={(e) => setPaymentForm((prev) => ({ ...prev, invoiceId: e.target.value }))}>
                      <option value="">Select invoice</option>
                      {invoices.filter((invoice) => (invoice.balanceCents || 0) > 0).map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.invoiceNumber} | {formatCurrency((invoice.balanceCents || 0) / 100)}</option>)}
                    </select>
                    <input type="number" step="0.01" value={paymentForm.amount} onChange={(e) => setPaymentForm((prev) => ({ ...prev, amount: e.target.value }))} placeholder="Amount" />
                    <select value={paymentForm.paymentMethod} onChange={(e) => setPaymentForm((prev) => ({ ...prev, paymentMethod: e.target.value }))}>{PAYMENT_METHODS.map((method) => <option key={method} value={method}>{method}</option>)}</select>
                    <input type="date" value={paymentForm.receivedAt} onChange={(e) => setPaymentForm((prev) => ({ ...prev, receivedAt: e.target.value }))} />
                    <input value={paymentForm.paymentReference} onChange={(e) => setPaymentForm((prev) => ({ ...prev, paymentReference: e.target.value }))} placeholder="Reference" />
                    <button className="btn btn-primary" type="submit">Record payment</button>
                  </div>
                </form>
              </div>
            ) : null}
          </ActionPanel>
          </div>

          <ActionPanel title="Activity log" icon={CalendarDays}>
            <SectionHeading title="Audit trail" description="Every tracked change with timestamps and who performed the update when available." />
            {history.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {history.slice(0, 12).map((item) => (
                  <div key={item.id} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "12px 14px", background: "var(--surface-2)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 13 }}>{EventLabel({ item })}</div>
                        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                          {item.changedByName || "System / unknown user"}
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                        <DateTimeStack value={item.changedAt} align="right" />
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                      {item.fromStatus ? `From ${item.fromStatus} to ${item.toStatus}` : item.toStatus ? `Status: ${item.toStatus}` : "General update"}
                      {item.note ? ` | ${item.note}` : ""}
                    </div>
                  </div>
                ))}
              </div>
            ) : <EmptyState text="No tracked activity yet." />}
          </ActionPanel>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <ActionPanel title="Immediate actions" icon={ShieldCheck}>
            <div style={{ fontSize: 13, color: "#5b4636", marginBottom: 12 }}>This panel should answer one question clearly: what should happen next on this job?</div>
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ padding: "12px 14px", borderRadius: "var(--radius-md)", background: "#fff4e5", border: "1px solid #f1d7b0" }}><div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 700, color: "#9a6700" }}>Next required action</div><div style={{ marginTop: 6, fontWeight: 800 }}>{nextAction(job)}</div></div>
              <div style={{ padding: "12px 14px", borderRadius: "var(--radius-md)", background: "var(--surface-2)", border: "1px solid var(--border)" }}><div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 700, color: "var(--text-tertiary)" }}>Current status</div><div style={{ marginTop: 6, fontWeight: 800 }}>{status.label}</div></div>
              <div style={{ padding: "12px 14px", borderRadius: "var(--radius-md)", background: "var(--surface-2)", border: "1px solid var(--border)" }}><div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 700, color: "var(--text-tertiary)" }}>Most relevant date</div><div style={{ marginTop: 6, fontWeight: 800 }}><DateTimeStack value={operationalDate(job)} /></div></div>
            </div>
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 700, color: "var(--text-tertiary)", marginBottom: 8 }}>
                Workflow shortcuts
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {quickActions.length === 0 ? (
                  <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>No quick actions for this status.</span>
                ) : quickActions.map((action) => (
                  <button
                    key={`${action.kind}-${action.label}`}
                    type="button"
                    className={action.kind === "status" ? "btn btn-primary" : "btn btn-outline"}
                    onClick={() => {
                      if (action.kind === "status") return runQuickStatusAction(action);
                      if (action.kind === "invoice") return runQuickInvoiceAction(action);
                      if (action.kind === "payment") return runQuickPaymentAction();
                    }}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </div>
          </ActionPanel>
          {canManageOps ? (
            <div ref={statusRef}>
            <ActionPanel title="Status control" icon={CalendarDays}>
              <form onSubmit={handleStatusSubmit} style={{ display: "grid", gap: 10 }}>
                <select value={statusForm.toStatus} onChange={(e) => setStatusForm((prev) => ({ ...prev, toStatus: e.target.value }))}>{STATUS_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}</select>
                <input type="date" value={statusForm.effectiveDate} onChange={(e) => setStatusForm((prev) => ({ ...prev, effectiveDate: e.target.value }))} />
                <input value={statusForm.note} onChange={(e) => setStatusForm((prev) => ({ ...prev, note: e.target.value }))} placeholder="Transition note" />
                <button className="btn btn-primary" type="submit">Update status</button>
              </form>
            </ActionPanel>
            </div>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}
