"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { getAllowedStatusTransitions, getWorkflowAdvanceAction } from "@/lib/job-workflow";
import { formatCurrency, formatDate, formatDateTimeParts } from "@/lib/utils";
import {
  ArrowLeft,
  CalendarDays,
  CircleDollarSign,
  ClipboardList,
  Home,
  Mail,
  MessageSquareMore,
  NotebookPen,
  Phone,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useUserRole } from "@/lib/useUserRole";

const INVOICE_TYPES = ["M1", "M2", "ADDER", "SPECIAL"];
const PAYMENT_METHODS = ["ACH", "WIRE", "CHECK", "CREDIT_CARD", "FINANCER", "CASH", "OTHER"];
const CONTACT_CHANNELS = ["call", "text", "email", "voicemail", "note"];
const CONTACT_DIRECTIONS = ["outbound", "inbound", "internal"];
const TASK_PRIORITIES = ["high", "medium", "low"];
const INSPECTION_TYPES = ["electrical", "building", "final", "other"];
const INSPECTION_RESULTS = ["scheduled", "passed", "failed", "cancelled"];
const FIELD_VISIT_TYPES = ["install_day", "site_visit", "service_call"];
const FIELD_VISIT_STATUSES = ["scheduled", "in_progress", "completed", "cancelled"];

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

function formatLabel(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function taskPriorityMeta(priority) {
  if (priority === "high") return "badge-red";
  if (priority === "medium") return "badge-amber";
  return "badge-slate";
}

function taskStatusMeta(status) {
  if (status === "done") return "badge-green";
  if (status === "in_progress") return "badge-blue";
  return "badge-amber";
}

function inspectionResultBadge(result) {
  if (result === "passed") return "badge-green";
  if (result === "failed") return "badge-red";
  if (result === "cancelled") return "badge-slate";
  return "badge-blue";
}

function fieldVisitStatusBadge(status) {
  if (status === "completed") return "badge-green";
  if (status === "in_progress") return "badge-blue";
  if (status === "cancelled") return "badge-slate";
  return "badge-amber";
}

function fieldVisitTypeBadge(type) {
  if (type === "service_call") return "badge-red";
  if (type === "site_visit") return "badge-amber";
  return "badge-blue";
}

function defaultVisitTitle(visitType, installDayNumber) {
  if (visitType === "install_day") return `Install day ${installDayNumber || 1}`;
  if (visitType === "service_call") return "Service call";
  return "Site visit";
}

function isOverdueTask(task) {
  return task?.status !== "done" && !!task?.dueAt && String(task.dueAt) < new Date().toISOString().slice(0, 10);
}

function fieldValue(value) {
  return value || "-";
}

function nextAction(job) {
  switch (job.currentStatus) {
    case "created": return "Schedule the job";
    case "scheduled": return "Mark install complete";
    case "install_completed": return "Schedule inspection";
    case "inspection_scheduled": return "Log inspection result";
    case "inspection_failed": return "Reschedule inspection";
    case "inspection_passed": return "Submit PTO";
    case "pto_submitted": return "Follow up with utility";
    case "pto_granted": return "Start final billing";
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
    <div style={{ padding: "12px 14px", borderRadius: "var(--radius-md)", background: strong ? "var(--amber-bg)" : "var(--surface-2)", border: strong ? "1px solid var(--amber)" : "1px solid var(--border)" }}>
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
        <Icon size={15} style={{ color: "var(--amber)" }} />
        <div style={{ fontWeight: 800, fontSize: 14 }}>{title}</div>
      </div>
      {children}
    </div>
  );
}

function EmptyState({ text }) {
  return <div style={{ padding: "12px 0", fontSize: 13, color: "var(--text-secondary)" }}>{text}</div>;
}

function MiniMetric({ label, value, strong = false }) {
  return (
    <div style={{ padding: "12px 14px", borderRadius: "var(--radius-md)", background: strong ? "var(--amber-bg)" : "var(--surface-2)", border: strong ? "1px solid var(--amber)" : "1px solid var(--border)" }}>
      <div style={{ fontSize: 10, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700, marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{value}</div>
    </div>
  );
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
      <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--amber)" }}>{title}</div>
      {description ? <div style={{ marginTop: 3, fontSize: 12, color: "var(--text-secondary)" }}>{description}</div> : null}
    </div>
  );
}

function EventLabel({ item }) {
  if (item.eventType === "status_changed") return "Status updated";
  if (item.eventType === "invoice_created") return "Invoice created";
  if (item.eventType === "payment_received") return "Payment recorded";
  if (item.eventType === "note" && item.note?.startsWith("CRM contact logged:")) return "CRM contact logged";
  if (item.eventType === "note" && item.note?.startsWith("CRM follow-up task")) return "Follow-up task updated";
  if (item.eventType === "note" && item.note === "Updated CRM follow-up details") return "CRM details updated";
  if (item.eventType === "note") return "Project record updated";
  return item.eventType?.replace(/_/g, " ") || "Activity";
}

export default function JobDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { isOwner, isAdmin, loading: roleLoading, role } = useUserRole();
  const [job, setJob] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);
  const [inspections, setInspections] = useState([]);
  const [fieldVisits, setFieldVisits] = useState([]);
  const [fieldTrackingInstalled, setFieldTrackingInstalled] = useState(true);
  const [history, setHistory] = useState([]);
  const [crm, setCrm] = useState(null);
  const [teamMembers, setTeamMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [editingJob, setEditingJob] = useState(false);
  const [jobForm, setJobForm] = useState(null);
  const [crmForm, setCrmForm] = useState({ lastContactAt: "", nextFollowUpAt: "", followUpOwnerId: "" });
  const [contactForm, setContactForm] = useState({ channel: "call", direction: "outbound", summary: "", details: "", contactedAt: "" });
  const [taskForm, setTaskForm] = useState({ title: "", details: "", priority: "high", dueAt: "", ownerUserId: "" });
  const [inspectionForm, setInspectionForm] = useState({ inspectionType: "final", result: "scheduled", scheduledAt: "", completedAt: "", authorityName: "", inspectorName: "", notes: "" });
  const [installVisitForm, setInstallVisitForm] = useState({ visitType: "install_day", status: "completed", visitDate: "", installDayNumber: "", title: "", details: "", outcome: "", assignedUserId: "" });
  const [revisitForm, setRevisitForm] = useState({ visitType: "site_visit", status: "scheduled", visitDate: "", title: "", details: "", outcome: "", assignedUserId: "" });
  const [statusForm, setStatusForm] = useState({ toStatus: "scheduled", effectiveDate: "", note: "" });
  const [invoiceForm, setInvoiceForm] = useState({ invoiceType: "M1", invoiceNumber: "", amount: "", issuedAt: "", dueAt: "", description: "", memo: "" });
  const [paymentForm, setPaymentForm] = useState({ invoiceId: "", amount: "", paymentMethod: "ACH", receivedAt: "", paymentReference: "", notes: "" });
  const [message, setMessage] = useState({ type: "", text: "" });
  const billingRef = useRef(null);
  const statusRef = useRef(null);
  const crmRef = useRef(null);
  const canManageOps = isOwner || isAdmin || role === "ops";

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [detailRes, teamRes] = await Promise.all([
          fetch(`/api/v2/jobs/${id}/full`),
          fetch("/api/v2/team"),
        ]);
        const detailData = await detailRes.json().catch(() => ({}));
        const teamData = teamRes.ok ? await teamRes.json().catch(() => []) : [];
        if (!detailRes.ok) throw new Error(detailData.error || "Failed to load job");
        if (cancelled) return;
        setJob(detailData.job || null);
        setInvoices(Array.isArray(detailData.invoices) ? detailData.invoices : []);
        setInspections(Array.isArray(detailData.inspections) ? detailData.inspections : []);
        setFieldVisits(Array.isArray(detailData.fieldVisits) ? detailData.fieldVisits : []);
        setFieldTrackingInstalled(detailData.fieldTrackingInstalled !== false);
        setHistory(Array.isArray(detailData.history) ? detailData.history : []);
        setPayments(Array.isArray(detailData.payments) ? detailData.payments : []);
        setCrm(detailData.crm || null);
        setTeamMembers(Array.isArray(teamData) ? teamData : []);
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
    const allowedTransitions = getAllowedStatusTransitions(job.currentStatus);
    setStatusForm((prev) => ({
      ...prev,
      toStatus: allowedTransitions.includes(prev.toStatus)
        ? prev.toStatus
        : allowedTransitions[0] || job.currentStatus || "scheduled",
    }));
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
    if (!job || !crm) return;
    setCrmForm({
      lastContactAt: crm.summary?.lastContactAt ? String(crm.summary.lastContactAt).slice(0, 16) : "",
      nextFollowUpAt: crm.summary?.nextFollowUpAt || "",
      followUpOwnerId: crm.summary?.followUpOwnerId || "",
    });
    setContactForm((prev) => ({
      ...prev,
      contactedAt: prev.contactedAt || new Date().toISOString().slice(0, 16),
    }));
    setTaskForm((prev) => ({
      ...prev,
      ownerUserId: prev.ownerUserId || crm.summary?.followUpOwnerId || job?.repUserId || "",
    }));
  }, [crm, job]);

  const installVisits = useMemo(
    () => [...fieldVisits]
      .filter((visit) => visit.visitType === "install_day")
      .sort((left, right) => Number(left.installDayNumber || 0) - Number(right.installDayNumber || 0) || String(left.visitDate || "").localeCompare(String(right.visitDate || ""))),
    [fieldVisits]
  );

  const revisitVisits = useMemo(
    () => [...fieldVisits]
      .filter((visit) => visit.visitType !== "install_day")
      .sort((left, right) => String(right.visitDate || "").localeCompare(String(left.visitDate || ""))),
    [fieldVisits]
  );

  const nextInstallDayNumber = useMemo(
    () => installVisits.reduce((max, visit) => Math.max(max, Number(visit.installDayNumber || 0)), 0) + 1,
    [installVisits]
  );

  useEffect(() => {
    if (!job) return;
    const today = new Date().toISOString().slice(0, 10);
    setInspectionForm((prev) => ({
      ...prev,
      scheduledAt: prev.scheduledAt || new Date().toISOString().slice(0, 16),
    }));
    setInstallVisitForm((prev) => ({
      ...prev,
      visitDate: prev.visitDate || today,
      installDayNumber: prev.installDayNumber || String(nextInstallDayNumber),
      assignedUserId: prev.assignedUserId || job.repUserId || "",
    }));
    setRevisitForm((prev) => ({
      ...prev,
      visitDate: prev.visitDate || today,
      assignedUserId: prev.assignedUserId || job.repUserId || "",
    }));
  }, [job, nextInstallDayNumber]);

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
  const contactLog = useMemo(() => crm?.contactLog || [], [crm]);
  const followUpTasks = useMemo(() => crm?.tasks || [], [crm]);
  const openTasks = useMemo(() => followUpTasks.filter((task) => task.status !== "done"), [followUpTasks]);
  const overdueTasks = useMemo(() => openTasks.filter((task) => isOverdueTask(task)), [openTasks]);
  const crmInstalled = crm?.installed !== false;
  const availableStatusOptions = useMemo(() => getAllowedStatusTransitions(job?.currentStatus), [job?.currentStatus]);

  const quickActions = useMemo(() => {
    if (!job) return [];
    const today = new Date().toISOString().slice(0, 10);
    const actions = [];
    const workflowAction = canManageOps ? getWorkflowAdvanceAction(job, "Job detail") : null;

    if (workflowAction) {
      actions.push({
        label: workflowAction.label,
        kind: "status",
        toStatus: workflowAction.toStatus,
        note: workflowAction.note,
        date: workflowAction.effectiveDate,
      });
    }
    if (isOwner && ["install_completed", "inspection_scheduled", "inspection_passed"].includes(job.currentStatus)) {
      actions.push({ label: "Prepare M1 invoice", kind: "invoice", invoiceType: "M1" });
    }
    if (isOwner && ["pto_granted", "m1_paid"].includes(job.currentStatus)) {
      actions.push({ label: "Prepare M2 invoice", kind: "invoice", invoiceType: "M2" });
    }
    if (isOwner && invoices.some((invoice) => (invoice.balanceCents || 0) > 0)) {
      actions.push({ label: "Record payment", kind: "payment" });
    }
    if (canManageOps && !["on_hold", "cancelled", "paid_in_full"].includes(job.currentStatus)) {
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

  async function handleInspectionSubmit(e) {
    e.preventDefault();
    setMessage({ type: "", text: "" });
    try {
      const res = await fetch(`/api/v2/jobs/${id}/inspections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inspectionForm),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to save inspection");
      setInspectionForm((prev) => ({
        ...prev,
        result: "scheduled",
        scheduledAt: new Date().toISOString().slice(0, 16),
        completedAt: "",
        authorityName: "",
        inspectorName: "",
        notes: "",
      }));
      setMessage({ type: "success", text: "Inspection logged." });
      setRefreshKey((v) => v + 1);
    } catch (err) {
      setMessage({ type: "error", text: err.message || "Failed to save inspection" });
    }
  }

  async function handleInstallVisitSubmit(e) {
    e.preventDefault();
    setMessage({ type: "", text: "" });
    try {
      const payload = {
        ...installVisitForm,
        title: installVisitForm.title || defaultVisitTitle("install_day", installVisitForm.installDayNumber),
      };
      const res = await fetch(`/api/v2/jobs/${id}/field-visits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to save field visit");
      setInstallVisitForm((prev) => ({
        ...prev,
        visitDate: new Date().toISOString().slice(0, 10),
        installDayNumber: String(nextInstallDayNumber + 1),
        title: "",
        details: "",
        outcome: "",
      }));
      setMessage({ type: "success", text: "Field visit logged." });
      setRefreshKey((v) => v + 1);
    } catch (err) {
      setMessage({ type: "error", text: err.message || "Failed to save field visit" });
    }
  }

  async function handleRevisitSubmit(e) {
    e.preventDefault();
    setMessage({ type: "", text: "" });
    try {
      const payload = {
        ...revisitForm,
        title: revisitForm.title || defaultVisitTitle(revisitForm.visitType),
      };
      const res = await fetch(`/api/v2/jobs/${id}/field-visits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to save field visit");
      setRevisitForm((prev) => ({
        ...prev,
        visitDate: new Date().toISOString().slice(0, 10),
        title: "",
        details: "",
        outcome: "",
      }));
      setMessage({ type: "success", text: "Field visit logged." });
      setRefreshKey((v) => v + 1);
    } catch (err) {
      setMessage({ type: "error", text: err.message || "Failed to save field visit" });
    }
  }

  async function updateFieldVisit(visit, updates) {
    setMessage({ type: "", text: "" });
    try {
      const res = await fetch(`/api/v2/jobs/${id}/field-visits/${visit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: visit.title,
          details: visit.details,
          outcome: visit.outcome,
          assignedUserId: visit.assignedUserId || "",
          visitDate: visit.visitDate,
          status: visit.status,
          ...updates,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to update field visit");
      setMessage({ type: "success", text: "Field visit updated." });
      setRefreshKey((v) => v + 1);
    } catch (err) {
      setMessage({ type: "error", text: err.message || "Failed to update field visit" });
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

  async function handleCrmSave(e) {
    e.preventDefault();
    setMessage({ type: "", text: "" });
    try {
      const res = await fetch(`/api/v2/jobs/${id}/crm`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...crmForm,
          lastContactAt: crmForm.lastContactAt ? new Date(crmForm.lastContactAt).toISOString() : "",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to update follow-up details");
      setMessage({ type: "success", text: "CRM follow-up details updated." });
      setRefreshKey((v) => v + 1);
    } catch (err) {
      setMessage({ type: "error", text: err.message || "Failed to update follow-up details" });
    }
  }

  async function handleContactSubmit(e) {
    e.preventDefault();
    setMessage({ type: "", text: "" });
    try {
      const res = await fetch(`/api/v2/jobs/${id}/crm/contact-log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...contactForm,
          contactedAt: contactForm.contactedAt ? new Date(contactForm.contactedAt).toISOString() : "",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to save communication log");
      setContactForm({ channel: "call", direction: "outbound", summary: "", details: "", contactedAt: new Date().toISOString().slice(0, 16) });
      setMessage({ type: "success", text: "Communication log added." });
      setRefreshKey((v) => v + 1);
    } catch (err) {
      setMessage({ type: "error", text: err.message || "Failed to save communication log" });
    }
  }

  async function handleTaskSubmit(e) {
    e.preventDefault();
    setMessage({ type: "", text: "" });
    try {
      const res = await fetch(`/api/v2/jobs/${id}/crm/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(taskForm),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to create follow-up task");
      setTaskForm({
        title: "",
        details: "",
        priority: "high",
        dueAt: "",
        ownerUserId: crm?.summary?.followUpOwnerId || job?.repUserId || "",
      });
      setMessage({ type: "success", text: "Follow-up task created." });
      setRefreshKey((v) => v + 1);
    } catch (err) {
      setMessage({ type: "error", text: err.message || "Failed to create follow-up task" });
    }
  }

  async function updateTask(task, updates) {
    setMessage({ type: "", text: "" });
    try {
      const res = await fetch(`/api/v2/jobs/${id}/crm/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: task.title,
          details: task.details,
          priority: task.priority,
          dueAt: task.dueAt,
          ownerUserId: task.ownerUserId || "",
          ...updates,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to update follow-up task");
      setMessage({ type: "success", text: "Follow-up task updated." });
      setRefreshKey((v) => v + 1);
    } catch (err) {
      setMessage({ type: "error", text: err.message || "Failed to update follow-up task" });
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
    router.push(`/invoices/new?jobId=${id}&type=${action.invoiceType}`);
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
  const ownerOptions = teamMembers.filter((member) => member.isActive);

  return (
    <AppShell>
      <div style={{ marginBottom: 18 }}>
        <Link href="/jobs" style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none", color: "var(--text-secondary)", fontSize: 12, marginBottom: 12 }}>
          <ArrowLeft size={13} /> Back to jobs
        </Link>

        <div className="card" style={{ padding: "22px 24px", background: "linear-gradient(135deg, var(--surface) 0%, var(--surface-2) 100%)", border: "1px solid var(--border)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.03em", margin: 0 }}>{job.customerName}</h1>
                <span className="mono badge badge-slate">{job.jobNumber}</span>
                <span style={{ padding: "5px 10px", borderRadius: 999, background: status.bg, color: status.color, fontSize: 12, fontWeight: 800 }}>{status.label}</span>
                {job.customerPath ? (
                  <Link
                    href={job.customerPath}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 999, background: "var(--surface-2)", color: "var(--text-primary)", fontSize: 12, fontWeight: 700, textDecoration: "none", border: "1px solid var(--border)" }}
                  >
                    <UserRound size={12} />
                    Customer record
                  </Link>
                ) : null}
              </div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 }}>
                {[job.address?.street1, job.address?.city, job.address?.state, job.address?.postalCode].filter(Boolean).join(", ")}
              </div>
              <div style={{ fontSize: 14, color: "var(--text-secondary)" }}>Next action: <strong style={{ color: "var(--text-primary)" }}>{nextAction(job)}</strong></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(120px, 1fr))", gap: 10, minWidth: 360 }}>
              <MilestoneCard label="Current stage" value={status.label} strong />
              <MilestoneCard label={crm?.summary?.nextFollowUpAt ? "Next follow-up" : "Next date"} value={<DateTimeStack value={crm?.summary?.nextFollowUpAt || operationalDate(job)} />} />
              <MilestoneCard label="Outstanding" value={isOwner ? formatCurrency((job.financialSummary?.outstandingCents || 0) / 100) : "Hidden"} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 10, marginTop: 18 }}>
            {TIMELINE.map((item, index) => {
              const active = index <= timelineIndex;
              return <div key={item.key} style={{ padding: "10px 12px", borderRadius: "var(--radius-md)", background: active ? "var(--text-primary)" : "var(--surface-soft)", color: active ? "var(--accent-text)" : "var(--text-secondary)", border: active ? "none" : "1px solid var(--border)", fontSize: 12, fontWeight: 700, textAlign: "center" }}>{item.label}</div>;
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
              { label: "Logged install days", value: installVisits.length || "-" },
              { label: "Latest field day", value: installVisits[installVisits.length - 1]?.visitDate ? formatDate(installVisits[installVisits.length - 1].visitDate) : "-" },
              { label: "Crew", value: fieldValue(job.crewNames?.join(", ")) },
              { label: "Next action", value: nextAction(job) },
            ]} />

            {!fieldTrackingInstalled ? (
              <div style={{ marginTop: 14, padding: "12px 14px", borderRadius: "var(--radius-md)", background: "#fff8e8", border: "1px solid #f3d489", color: "#8a5308", fontSize: 13, lineHeight: 1.6 }}>
                Apply `db/migrations/004_field_visit_tracking.sql` to track install day 1, day 2, day 3, and any revisit history on the job.
              </div>
            ) : (
              <>
                {canManageOps ? (
                  <form onSubmit={handleInstallVisitSubmit} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 14, marginTop: 14, marginBottom: 12 }}>
                    <div style={{ fontWeight: 700, marginBottom: 10 }}>Log install day</div>
                    <div style={{ display: "grid", gap: 10 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                        <select value={installVisitForm.status} onChange={(e) => setInstallVisitForm((prev) => ({ ...prev, status: e.target.value }))}>
                          {FIELD_VISIT_STATUSES.map((item) => <option key={item} value={item}>{formatLabel(item)}</option>)}
                        </select>
                        <input type="date" value={installVisitForm.visitDate} onChange={(e) => setInstallVisitForm((prev) => ({ ...prev, visitDate: e.target.value }))} />
                        <input type="number" min="1" value={installVisitForm.installDayNumber} onChange={(e) => setInstallVisitForm((prev) => ({ ...prev, installDayNumber: e.target.value, visitType: "install_day" }))} placeholder="Day #" />
                      </div>
                      <input value={installVisitForm.title} onChange={(e) => setInstallVisitForm((prev) => ({ ...prev, title: e.target.value, visitType: "install_day" }))} placeholder={`Default: ${defaultVisitTitle("install_day", installVisitForm.installDayNumber || nextInstallDayNumber)}`} />
                      <textarea rows={3} value={installVisitForm.details} onChange={(e) => setInstallVisitForm((prev) => ({ ...prev, details: e.target.value, visitType: "install_day" }))} placeholder="What was done on this install day?" style={{ resize: "vertical" }} />
                      <textarea rows={2} value={installVisitForm.outcome} onChange={(e) => setInstallVisitForm((prev) => ({ ...prev, outcome: e.target.value, visitType: "install_day" }))} placeholder="Outcome, blocker, or next step" style={{ resize: "vertical" }} />
                      <select value={installVisitForm.assignedUserId} onChange={(e) => setInstallVisitForm((prev) => ({ ...prev, assignedUserId: e.target.value, visitType: "install_day" }))}>
                        <option value="">Unassigned</option>
                        {ownerOptions.map((member) => (
                          <option key={member.id} value={member.id}>{member.name} · {formatLabel(member.role)}</option>
                        ))}
                      </select>
                      <button className="btn btn-outline" type="submit">Add install day</button>
                    </div>
                  </form>
                ) : null}

                {installVisits.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {installVisits.map((visit) => (
                      <div key={visit.id} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "12px 14px", background: visit.status === "completed" ? "var(--surface-2)" : "#fff8e8" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 6 }}>
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                              <div style={{ fontWeight: 700 }}>{visit.title}</div>
                              <span className={`badge ${fieldVisitTypeBadge(visit.visitType)}`}>Day {visit.installDayNumber}</span>
                              <span className={`badge ${fieldVisitStatusBadge(visit.status)}`}>{formatLabel(visit.status)}</span>
                            </div>
                            <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>{visit.details || "No install details logged."}</div>
                            {visit.outcome ? <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6, marginTop: 6 }}>Outcome: {visit.outcome}</div> : null}
                          </div>
                          <div style={{ textAlign: "right", fontSize: 12, color: "var(--text-secondary)" }}>
                            <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>{formatDate(visit.visitDate)}</div>
                            <div>{visit.assignedUserName || "Unassigned"}</div>
                          </div>
                        </div>
                        {canManageOps ? (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                            {visit.status !== "completed" ? (
                              <button type="button" className="btn btn-ghost" onClick={() => updateFieldVisit(visit, { status: visit.status === "scheduled" ? "in_progress" : "completed" })}>
                                {visit.status === "scheduled" ? "Start day" : "Mark complete"}
                              </button>
                            ) : null}
                            {visit.status !== "cancelled" ? (
                              <button type="button" className="btn btn-ghost" onClick={() => updateFieldVisit(visit, { status: "cancelled" })}>Cancel</button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : <EmptyState text="No install day records yet. Log day 1, day 2, and day 3 here instead of losing them in notes." />}
              </>
            )}
          </ActionPanel>

          <ActionPanel title="Inspection" icon={ClipboardList}>
            <SectionHeading title="Inspection tracking" description="Scheduling, results, authority details, and follow-up notes." />
            {canManageOps ? (
              <form onSubmit={handleInspectionSubmit} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 14, marginBottom: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 10 }}>Log inspection event</div>
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <select value={inspectionForm.inspectionType} onChange={(e) => setInspectionForm((prev) => ({ ...prev, inspectionType: e.target.value }))}>
                      {INSPECTION_TYPES.map((item) => <option key={item} value={item}>{formatLabel(item)}</option>)}
                    </select>
                    <select value={inspectionForm.result} onChange={(e) => setInspectionForm((prev) => ({ ...prev, result: e.target.value }))}>
                      {INSPECTION_RESULTS.map((item) => <option key={item} value={item}>{formatLabel(item)}</option>)}
                    </select>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <input type="datetime-local" value={inspectionForm.scheduledAt} onChange={(e) => setInspectionForm((prev) => ({ ...prev, scheduledAt: e.target.value }))} />
                    <input type="datetime-local" value={inspectionForm.completedAt} onChange={(e) => setInspectionForm((prev) => ({ ...prev, completedAt: e.target.value }))} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <input value={inspectionForm.authorityName} onChange={(e) => setInspectionForm((prev) => ({ ...prev, authorityName: e.target.value }))} placeholder="AHJ / authority" />
                    <input value={inspectionForm.inspectorName} onChange={(e) => setInspectionForm((prev) => ({ ...prev, inspectorName: e.target.value }))} placeholder="Inspector name" />
                  </div>
                  <textarea rows={3} value={inspectionForm.notes} onChange={(e) => setInspectionForm((prev) => ({ ...prev, notes: e.target.value }))} placeholder="Result details, correction list, or reschedule note" style={{ resize: "vertical" }} />
                  <button className="btn btn-outline" type="submit">Add inspection record</button>
                </div>
              </form>
            ) : null}
            {inspections.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {inspections.map((inspection) => (
                  <div key={inspection.id} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "12px 14px", background: inspection.result === "failed" ? "#fff2f0" : "var(--surface-2)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span className="badge badge-slate">{formatLabel(inspection.inspectionType)}</span>
                        <span className={`badge ${inspectionResultBadge(inspection.result)}`}>{formatLabel(inspection.result)}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                        <div>Scheduled: {formatDate(inspection.scheduledAt)}</div>
                        <div>Completed: {formatDate(inspection.completedAt)}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 6 }}>
                      <div>Authority: <strong style={{ color: "var(--text-primary)" }}>{fieldValue(inspection.authorityName)}</strong></div>
                      <div>Inspector: <strong style={{ color: "var(--text-primary)" }}>{fieldValue(inspection.inspectorName)}</strong></div>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>{inspection.notes || "No inspection notes logged."}</div>
                  </div>
                ))}
              </div>
            ) : <EmptyState text="No inspection records yet." />}
          </ActionPanel>

          <ActionPanel title="Site Visits & Service Calls" icon={CalendarDays}>
            <SectionHeading title="Revisit tracking" description="Track every return trip after the original install, whether it is a site visit or a service call." />
            {!fieldTrackingInstalled ? (
              <div style={{ padding: "12px 14px", borderRadius: "var(--radius-md)", background: "#fff8e8", border: "1px solid #f3d489", color: "#8a5308", fontSize: 13, lineHeight: 1.6 }}>
                Apply `db/migrations/004_field_visit_tracking.sql` to log site visits and service calls here.
              </div>
            ) : (
              <>
                {canManageOps ? (
                  <form onSubmit={handleRevisitSubmit} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 14, marginBottom: 12 }}>
                    <div style={{ fontWeight: 700, marginBottom: 10 }}>Log site visit or service call</div>
                    <div style={{ display: "grid", gap: 10 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                        <select value={revisitForm.visitType} onChange={(e) => setRevisitForm((prev) => ({ ...prev, visitType: e.target.value, title: prev.title || defaultVisitTitle(e.target.value) }))}>
                          {FIELD_VISIT_TYPES.filter((item) => item !== "install_day").map((item) => <option key={item} value={item}>{formatLabel(item)}</option>)}
                        </select>
                        <select value={revisitForm.status} onChange={(e) => setRevisitForm((prev) => ({ ...prev, status: e.target.value }))}>
                          {FIELD_VISIT_STATUSES.map((item) => <option key={item} value={item}>{formatLabel(item)}</option>)}
                        </select>
                        <input type="date" value={revisitForm.visitDate} onChange={(e) => setRevisitForm((prev) => ({ ...prev, visitDate: e.target.value }))} />
                      </div>
                      <input value={revisitForm.title} onChange={(e) => setRevisitForm((prev) => ({ ...prev, title: e.target.value }))} placeholder="What is the revisit for?" />
                      <textarea rows={3} value={revisitForm.details} onChange={(e) => setRevisitForm((prev) => ({ ...prev, details: e.target.value }))} placeholder="Issue, homeowner need, or reason for going back" style={{ resize: "vertical" }} />
                      <textarea rows={2} value={revisitForm.outcome} onChange={(e) => setRevisitForm((prev) => ({ ...prev, outcome: e.target.value }))} placeholder="Outcome, resolution, or next step" style={{ resize: "vertical" }} />
                      <select value={revisitForm.assignedUserId} onChange={(e) => setRevisitForm((prev) => ({ ...prev, assignedUserId: e.target.value }))}>
                        <option value="">Unassigned</option>
                        {ownerOptions.map((member) => (
                          <option key={member.id} value={member.id}>{member.name} · {formatLabel(member.role)}</option>
                        ))}
                      </select>
                      <button className="btn btn-outline" type="submit">Add revisit</button>
                    </div>
                  </form>
                ) : null}

                {revisitVisits.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {revisitVisits.map((visit) => (
                      <div key={visit.id} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "12px 14px", background: visit.visitType === "service_call" ? "#fff4f1" : "var(--surface-2)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 6 }}>
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                              <div style={{ fontWeight: 700 }}>{visit.title}</div>
                              <span className={`badge ${fieldVisitTypeBadge(visit.visitType)}`}>{formatLabel(visit.visitType)}</span>
                              <span className={`badge ${fieldVisitStatusBadge(visit.status)}`}>{formatLabel(visit.status)}</span>
                            </div>
                            <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>{visit.details || "No extra revisit details logged."}</div>
                            {visit.outcome ? <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6, marginTop: 6 }}>Outcome: {visit.outcome}</div> : null}
                          </div>
                          <div style={{ textAlign: "right", fontSize: 12, color: "var(--text-secondary)" }}>
                            <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>{formatDate(visit.visitDate)}</div>
                            <div>{visit.assignedUserName || "Unassigned"}</div>
                          </div>
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: canManageOps ? 8 : 0 }}>
                          Logged by {visit.createdByName || "Unknown user"}{visit.completedAt ? ` · Completed ${formatDate(visit.completedAt)}` : ""}
                        </div>
                        {canManageOps ? (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                            {visit.status !== "completed" ? (
                              <button type="button" className="btn btn-ghost" onClick={() => updateFieldVisit(visit, { status: visit.status === "scheduled" ? "in_progress" : "completed" })}>
                                {visit.status === "scheduled" ? "Start visit" : "Mark complete"}
                              </button>
                            ) : null}
                            {visit.status !== "cancelled" ? (
                              <button type="button" className="btn btn-ghost" onClick={() => updateFieldVisit(visit, { status: "cancelled" })}>Cancel</button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : <EmptyState text="No site visits or service calls have been logged yet." />}
              </>
            )}
          </ActionPanel>

          {isOwner ? (
          <div ref={billingRef}>
          <ActionPanel title="Financials" icon={CircleDollarSign}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, marginBottom: 14 }}>
              <MilestoneCard label="Invoiced" value={formatCurrency(invoiceSummary.total / 100)} />
              <MilestoneCard label="Collected" value={formatCurrency(invoiceSummary.paid / 100)} />
              <MilestoneCard label="Outstanding" value={formatCurrency(invoiceSummary.outstanding / 100)} strong />
            </div>
            {highlightedInvoice ? (
              <div style={{ padding: "12px 14px", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--surface-soft)", marginBottom: 14 }}>
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
                  {invoices.map((invoice) => (
                    <tr key={invoice.id} onClick={() => router.push(`/invoices/${invoice.id}`)} style={{ cursor: "pointer" }}>
                      <td><span className="mono badge badge-slate">{invoice.invoiceNumber}</span></td>
                      <td>{invoice.invoiceType}</td>
                      <td>{invoice.status}</td>
                      <td>{formatDate(invoice.issuedAt)}</td>
                      <td>{formatCurrency((invoice.totalCents || 0) / 100)}</td>
                      <td>{formatCurrency((invoice.balanceCents || 0) / 100)}</td>
                    </tr>
                  ))}
                </tbody></table>
              </div>
            ) : null}
            {isOwner && (
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {!invoices.find((inv) => inv.invoiceType === "M1") && (
                  <button
                    className="btn btn-outline"
                    onClick={() => router.push(`/invoices/new?jobId=${id}&type=M1`)}
                  >
                    Create M1 Invoice
                  </button>
                )}
                {!invoices.find((inv) => inv.invoiceType === "M2") && (
                  <button
                    className="btn btn-outline"
                    onClick={() => router.push(`/invoices/new?jobId=${id}&type=M2`)}
                  >
                    Create M2 Invoice
                  </button>
                )}
              </div>
            )}
          </ActionPanel>
          </div>
          ) : null}

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
          <div ref={crmRef}>
            <ActionPanel title="CRM workspace" icon={MessageSquareMore}>
              {!crmInstalled ? (
                <div style={{ padding: "12px 14px", borderRadius: "var(--radius-md)", background: "#fff8e8", border: "1px solid #f3d489", color: "#8a5308", fontSize: 13, lineHeight: 1.6 }}>
                  Apply `db/migrations/003_job_crm_workspace.sql` to enable contact logs, follow-up owner, and task tracking for this job.
                </div>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10, marginBottom: 14 }}>
                    <MiniMetric label="Last contact" value={crm?.summary?.lastContactAt ? <DateTimeStack value={crm.summary.lastContactAt} /> : "Not logged"} />
                    <MiniMetric label="Next follow-up" value={crm?.summary?.nextFollowUpAt ? formatDate(crm.summary.nextFollowUpAt) : "Not set"} strong />
                    <MiniMetric label="Owner" value={crm?.summary?.followUpOwnerName || "Unassigned"} />
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
                    {job.customerPhone ? (
                      <a className="btn btn-outline" href={`tel:${job.customerPhone}`}>
                        <Phone size={13} />
                        Call homeowner
                      </a>
                    ) : null}
                    {job.customerEmail ? (
                      <a className="btn btn-outline" href={`mailto:${job.customerEmail}`}>
                        <Mail size={13} />
                        Email homeowner
                      </a>
                    ) : null}
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => setContactForm((prev) => ({ ...prev, summary: prev.summary || "Quick homeowner update" }))}
                    >
                      <NotebookPen size={13} />
                      Prep log
                    </button>
                  </div>

                  {canManageOps ? (
                    <form onSubmit={handleCrmSave} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 14, marginBottom: 14 }}>
                      <div style={{ fontWeight: 700, marginBottom: 10 }}>Follow-up settings</div>
                      <div style={{ display: "grid", gap: 10 }}>
                        <FormField label="Last contact">
                          <input type="datetime-local" value={crmForm.lastContactAt} onChange={(e) => setCrmForm((prev) => ({ ...prev, lastContactAt: e.target.value }))} />
                        </FormField>
                        <FormField label="Next follow-up">
                          <input type="date" value={crmForm.nextFollowUpAt} onChange={(e) => setCrmForm((prev) => ({ ...prev, nextFollowUpAt: e.target.value }))} />
                        </FormField>
                        <FormField label="Follow-up owner">
                          <select value={crmForm.followUpOwnerId} onChange={(e) => setCrmForm((prev) => ({ ...prev, followUpOwnerId: e.target.value }))}>
                            <option value="">Unassigned</option>
                            {ownerOptions.map((member) => (
                              <option key={member.id} value={member.id}>{member.name} · {formatLabel(member.role)}</option>
                            ))}
                          </select>
                        </FormField>
                        <button className="btn btn-primary" type="submit">Save CRM details</button>
                      </div>
                    </form>
                  ) : null}

                  <div style={{ marginBottom: 14 }}>
                    <SectionHeading title="Communication log" description="Calls, emails, texts, and internal follow-up notes stay attached to the job." />
                    {canManageOps ? (
                      <form onSubmit={handleContactSubmit} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 14, marginBottom: 12 }}>
                        <div style={{ display: "grid", gap: 10 }}>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                            <select value={contactForm.channel} onChange={(e) => setContactForm((prev) => ({ ...prev, channel: e.target.value }))}>
                              {CONTACT_CHANNELS.map((channel) => <option key={channel} value={channel}>{formatLabel(channel)}</option>)}
                            </select>
                            <select value={contactForm.direction} onChange={(e) => setContactForm((prev) => ({ ...prev, direction: e.target.value }))}>
                              {CONTACT_DIRECTIONS.map((direction) => <option key={direction} value={direction}>{formatLabel(direction)}</option>)}
                            </select>
                          </div>
                          <input value={contactForm.summary} onChange={(e) => setContactForm((prev) => ({ ...prev, summary: e.target.value }))} placeholder="Summary of what happened" />
                          <textarea rows={3} value={contactForm.details} onChange={(e) => setContactForm((prev) => ({ ...prev, details: e.target.value }))} placeholder="More context, promise made, next commitment..." style={{ resize: "vertical" }} />
                          <input type="datetime-local" value={contactForm.contactedAt} onChange={(e) => setContactForm((prev) => ({ ...prev, contactedAt: e.target.value }))} />
                          <button className="btn btn-outline" type="submit">Add communication log</button>
                        </div>
                      </form>
                    ) : null}

                    {contactLog.length > 0 ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {contactLog.slice(0, 6).map((entry) => (
                          <div key={entry.id} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "12px 14px", background: "var(--surface-2)" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start", marginBottom: 6, flexWrap: "wrap" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                <span className={`badge ${entry.direction === "internal" ? "badge-slate" : "badge-blue"}`}>{formatLabel(entry.channel)}</span>
                                <span className={`badge ${entry.direction === "outbound" ? "badge-amber" : entry.direction === "inbound" ? "badge-green" : "badge-slate"}`}>{formatLabel(entry.direction)}</span>
                                <div style={{ fontWeight: 700 }}>{entry.summary}</div>
                              </div>
                              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                                <DateTimeStack value={entry.contactedAt} align="right" />
                              </div>
                            </div>
                            <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                              {entry.details || "No extra details logged."}
                            </div>
                            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 6 }}>
                              Logged by {entry.createdByName || "Unknown user"}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : <EmptyState text="No communication has been logged on this job yet." />}
                  </div>

                  <div>
                    <SectionHeading title="Follow-up tasks" description="Small, explicit next steps so nothing lives only in someone's head." />
                    {canManageOps ? (
                      <form onSubmit={handleTaskSubmit} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 14, marginBottom: 12 }}>
                        <div style={{ display: "grid", gap: 10 }}>
                          <input value={taskForm.title} onChange={(e) => setTaskForm((prev) => ({ ...prev, title: e.target.value }))} placeholder="Create a follow-up task" />
                          <textarea rows={3} value={taskForm.details} onChange={(e) => setTaskForm((prev) => ({ ...prev, details: e.target.value }))} placeholder="What exactly needs to happen?" style={{ resize: "vertical" }} />
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                            <select value={taskForm.priority} onChange={(e) => setTaskForm((prev) => ({ ...prev, priority: e.target.value }))}>
                              {TASK_PRIORITIES.map((priority) => <option key={priority} value={priority}>{formatLabel(priority)}</option>)}
                            </select>
                            <input type="date" value={taskForm.dueAt} onChange={(e) => setTaskForm((prev) => ({ ...prev, dueAt: e.target.value }))} />
                          </div>
                          <select value={taskForm.ownerUserId} onChange={(e) => setTaskForm((prev) => ({ ...prev, ownerUserId: e.target.value }))}>
                            <option value="">No owner yet</option>
                            {ownerOptions.map((member) => (
                              <option key={member.id} value={member.id}>{member.name} · {formatLabel(member.role)}</option>
                            ))}
                          </select>
                          <button className="btn btn-outline" type="submit">Create task</button>
                        </div>
                      </form>
                    ) : null}

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10, marginBottom: 12 }}>
                      <MiniMetric label="Open tasks" value={openTasks.length} />
                      <MiniMetric label="Overdue" value={overdueTasks.length} strong={overdueTasks.length > 0} />
                    </div>

                    {followUpTasks.length > 0 ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {followUpTasks.map((task) => (
                          <div key={task.id} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "12px 14px", background: task.status === "done" ? "var(--surface)" : isOverdueTask(task) ? "#fff4f1" : "var(--surface-2)" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 6 }}>
                              <div>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                                  <div style={{ fontWeight: 700, textDecoration: task.status === "done" ? "line-through" : "none" }}>{task.title}</div>
                                  <span className={`badge ${taskPriorityMeta(task.priority)}`}>{formatLabel(task.priority)}</span>
                                  <span className={`badge ${taskStatusMeta(task.status)}`}>{formatLabel(task.status)}</span>
                                </div>
                                <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                                  {task.details || "No extra details on this task."}
                                </div>
                              </div>
                              <div style={{ textAlign: "right", fontSize: 12, color: "var(--text-secondary)" }}>
                                <div style={{ fontWeight: 700, color: isOverdueTask(task) ? "#991b1b" : "var(--text-primary)" }}>{task.dueAt ? formatDate(task.dueAt) : "No due date"}</div>
                                <div>{task.ownerName || "Unassigned"}</div>
                              </div>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                              <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                                Created by {task.createdByName || "Unknown user"}{task.completedAt ? ` · Completed ${formatDate(task.completedAt)}` : ""}
                              </div>
                              {canManageOps ? (
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                                  {task.status !== "done" ? (
                                    <button type="button" className="btn btn-ghost" onClick={() => updateTask(task, { status: task.status === "open" ? "in_progress" : "done" })}>
                                      {task.status === "open" ? "Start task" : "Mark done"}
                                    </button>
                                  ) : (
                                    <button type="button" className="btn btn-ghost" onClick={() => updateTask(task, { status: "open" })}>
                                      Reopen
                                    </button>
                                  )}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : <EmptyState text="No follow-up tasks yet." />}
                  </div>
                </>
              )}
            </ActionPanel>
          </div>
          <ActionPanel title="Immediate actions" icon={ShieldCheck}>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>This panel should answer one question clearly: what should happen next on this job?</div>
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ padding: "12px 14px", borderRadius: "var(--radius-md)", background: "var(--amber-bg)", border: "1px solid var(--amber)" }}><div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 700, color: "var(--amber-text)" }}>Next required action</div><div style={{ marginTop: 6, fontWeight: 800 }}>{nextAction(job)}</div></div>
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
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 10 }}>
                {availableStatusOptions.length > 0
                  ? `Allowed next stages from ${status.label}: ${availableStatusOptions.map((item) => formatLabel(item)).join(", ")}.`
                  : "This job is in a terminal stage. Reopen it from an earlier workflow state only if the record needs correction."}
              </div>
              <form onSubmit={handleStatusSubmit} style={{ display: "grid", gap: 10 }}>
                <select
                  value={statusForm.toStatus}
                  onChange={(e) => setStatusForm((prev) => ({ ...prev, toStatus: e.target.value }))}
                  disabled={availableStatusOptions.length === 0}
                >
                  {availableStatusOptions.length > 0 ? (
                    availableStatusOptions.map((item) => <option key={item} value={item}>{formatLabel(item)}</option>)
                  ) : (
                    <option value={job.currentStatus}>{formatLabel(job.currentStatus)}</option>
                  )}
                </select>
                <input type="date" value={statusForm.effectiveDate} onChange={(e) => setStatusForm((prev) => ({ ...prev, effectiveDate: e.target.value }))} disabled={availableStatusOptions.length === 0} />
                <input value={statusForm.note} onChange={(e) => setStatusForm((prev) => ({ ...prev, note: e.target.value }))} placeholder="Transition note" disabled={availableStatusOptions.length === 0} />
                <button className="btn btn-primary" type="submit" disabled={availableStatusOptions.length === 0}>Update status</button>
              </form>
            </ActionPanel>
            </div>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}
