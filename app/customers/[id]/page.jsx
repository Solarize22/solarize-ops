"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import WorkspaceHeader from "@/components/WorkspaceHeader";
import { formatCurrency, formatDate, formatDateTimeParts } from "@/lib/utils";
import { AlertTriangle, ArrowLeft, CalendarDays, Mail, MessageSquareMore, NotebookPen, Phone, UserRound } from "lucide-react";
import { useUserRole } from "@/lib/useUserRole";

const CONTACT_CHANNELS = ["call", "text", "email", "voicemail", "note"];
const CONTACT_DIRECTIONS = ["outbound", "inbound", "internal"];
const TASK_PRIORITIES = ["high", "medium", "low"];

const STATUS_META = {
  created: { label: "Created", badge: "badge-slate" },
  scheduled: { label: "Scheduled", badge: "badge-blue" },
  install_completed: { label: "Install complete", badge: "badge-green" },
  inspection_scheduled: { label: "Inspection scheduled", badge: "badge-blue" },
  inspection_passed: { label: "Inspection passed", badge: "badge-green" },
  inspection_failed: { label: "Inspection failed", badge: "badge-red" },
  pto_submitted: { label: "PTO submitted", badge: "badge-amber" },
  pto_granted: { label: "PTO granted", badge: "badge-slate" },
  m1_invoiced: { label: "M1 invoiced", badge: "badge-slate" },
  m1_partially_paid: { label: "M1 partial", badge: "badge-amber" },
  m1_paid: { label: "M1 paid", badge: "badge-green" },
  m2_invoiced: { label: "M2 invoiced", badge: "badge-slate" },
  m2_partially_paid: { label: "M2 partial", badge: "badge-amber" },
  paid_in_full: { label: "Paid in full", badge: "badge-dark" },
  on_hold: { label: "On hold", badge: "badge-red" },
  cancelled: { label: "Cancelled", badge: "badge-slate" },
};

function statusMeta(status) {
  return STATUS_META[status] || STATUS_META.created;
}

function formatLabel(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function isOverdueTask(task) {
  return task?.status !== "done" && !!task?.dueAt && String(task.dueAt) < new Date().toISOString().slice(0, 10);
}

function EventLabel(item) {
  if (item.eventType === "status_changed") return "Status updated";
  if (item.eventType === "invoice_created") return "Invoice created";
  if (item.eventType === "payment_received") return "Payment recorded";
  if (item.eventType === "note" && item.note?.startsWith("CRM contact logged:")) return "CRM contact logged";
  if (item.eventType === "note" && item.note?.startsWith("CRM follow-up task")) return "Follow-up task updated";
  if (item.eventType === "note" && item.note === "Updated CRM follow-up details") return "CRM details updated";
  if (item.eventType === "note") return "Project record updated";
  return formatLabel(item.eventType);
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

function SummaryCard({ label, value, detail = "", strong = false }) {
  return (
    <div style={{ padding: "12px 14px", borderRadius: "var(--radius-md)", background: strong ? "var(--amber-bg)" : "var(--surface-2)", border: strong ? "1px solid var(--amber)" : "1px solid var(--border)" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700 }}>{value}</div>
      {detail ? <div style={{ marginTop: 4, fontSize: 12, color: "var(--text-secondary)" }}>{detail}</div> : null}
    </div>
  );
}

function ComposerCard({ title, description = "", onClose, children }) {
  return (
    <div className="composer-card">
      <div className="composer-card-header">
        <div>
          <div className="composer-card-title">{title}</div>
          {description ? <div className="composer-card-description">{description}</div> : null}
        </div>
        {onClose ? (
          <button type="button" className="btn btn-ghost" onClick={onClose} style={{ minHeight: 30, padding: "4px 10px" }}>
            Close
          </button>
        ) : null}
      </div>
      {children}
    </div>
  );
}

export default function CustomerDetailPage() {
  const { id } = useParams();
  const { canSeeFinancials, isOwner, isAdmin, role, loading: roleLoading } = useUserRole();
  const [data, setData] = useState(null);
  const [teamMembers, setTeamMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [composers, setComposers] = useState({ contact: false, task: false });
  const [contactForm, setContactForm] = useState({ jobId: "", channel: "call", direction: "outbound", summary: "", details: "", contactedAt: "" });
  const [taskForm, setTaskForm] = useState({ jobId: "", title: "", details: "", priority: "high", dueAt: "", ownerUserId: "" });
  const canManageOps = isOwner || isAdmin || role === "ops";

  function toggleComposer(key) {
    setComposers((current) => ({ ...current, [key]: !current[key] }));
  }

  function closeComposer(key) {
    setComposers((current) => ({ ...current, [key]: false }));
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [detailRes, teamRes] = await Promise.all([
          fetch(`/api/v2/customers/${id}`),
          fetch("/api/v2/team"),
        ]);
        const payload = await detailRes.json().catch(() => ({}));
        const teamPayload = teamRes.ok ? await teamRes.json().catch(() => []) : [];
        if (!detailRes.ok) throw new Error(payload.error || "Failed to load customer");
        if (!cancelled) {
          setData(payload);
          setTeamMembers(Array.isArray(teamPayload) ? teamPayload : []);
        }
      } catch (err) {
        if (!cancelled) setError(err.message || "Failed to load customer");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (id) load();
    return () => {
      cancelled = true;
    };
  }, [id, refreshKey]);

  const customer = data?.customer;
  const jobs = useMemo(() => data?.jobs || [], [data]);
  const contactLog = useMemo(() => data?.contactLog || [], [data]);
  const tasks = useMemo(() => data?.tasks || [], [data]);
  const history = useMemo(() => data?.history || [], [data]);
  const crmInstalled = data?.crmInstalled !== false;
  const primaryJob = useMemo(() => jobs.find((job) => job.isActive) || jobs[0] || null, [jobs]);
  const ownerOptions = useMemo(() => teamMembers.filter((member) => ["owner", "admin", "ops"].includes(member.role)), [teamMembers]);

  useEffect(() => {
    if (!primaryJob) return;
    setContactForm((prev) => ({
      ...prev,
      jobId: prev.jobId || primaryJob.id,
      contactedAt: prev.contactedAt || new Date().toISOString().slice(0, 16),
    }));
    setTaskForm((prev) => ({
      ...prev,
      jobId: prev.jobId || primaryJob.id,
    }));
  }, [primaryJob]);

  async function handleContactSubmit(event) {
    event.preventDefault();
    setMessage({ type: "", text: "" });
    try {
      const res = await fetch(`/api/v2/customers/${id}/contact-log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(contactForm),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Failed to create customer contact log");
      setContactForm((prev) => ({
        ...prev,
        summary: "",
        details: "",
        contactedAt: new Date().toISOString().slice(0, 16),
      }));
      setMessage({ type: "success", text: `Communication logged on ${payload.jobNumber || primaryJob?.jobNumber || "the customer record"}.` });
      closeComposer("contact");
      setRefreshKey((value) => value + 1);
    } catch (err) {
      setMessage({ type: "error", text: err.message || "Failed to create customer contact log" });
    }
  }

  async function handleTaskSubmit(event) {
    event.preventDefault();
    setMessage({ type: "", text: "" });
    try {
      const res = await fetch(`/api/v2/customers/${id}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(taskForm),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Failed to create customer follow-up task");
      setTaskForm((prev) => ({
        ...prev,
        title: "",
        details: "",
        dueAt: "",
      }));
      setMessage({ type: "success", text: `Task created on ${payload.jobNumber || primaryJob?.jobNumber || "the customer record"}.` });
      closeComposer("task");
      setRefreshKey((value) => value + 1);
    } catch (err) {
      setMessage({ type: "error", text: err.message || "Failed to create customer follow-up task" });
    }
  }

  if (loading || roleLoading) {
    return <AppShell><div className="empty-state">Loading customer...</div></AppShell>;
  }

  if (error || !customer) {
    return (
      <AppShell>
        <div className="empty-state">
          <div style={{ marginBottom: 10 }}>{error || "Customer not found."}</div>
          <Link href="/customers" style={{ textDecoration: "none" }}>Back to customers</Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div style={{ marginBottom: 18 }}>
        <Link href="/customers" className="detail-back-link">
          <ArrowLeft size={13} /> Back to customers
        </Link>

        <WorkspaceHeader
          eyebrow="Customer Workspace"
          title={customer.name}
          description={[customer.address?.street1, customer.address?.street2, customer.address?.city, customer.address?.state, customer.address?.postalCode].filter(Boolean).join(", ") || "Address not set"}
          actions={(
            <span className={`badge ${customer.needsFollowUp ? customer.atRiskJobCount > 0 || customer.overdueTaskCount > 0 ? "badge-red" : "badge-amber" : "badge-green"}`}>
              {customer.needsFollowUp ? (customer.atRiskJobCount > 0 || customer.overdueTaskCount > 0 ? "At risk" : "Needs follow-up") : "Healthy"}
            </span>
          )}
          aside={(
            <div className="detail-summary-grid three compact">
              <SummaryCard label="Last contact" value={customer.lastContactAt ? <DateTimeStack value={customer.lastContactAt} /> : "Not logged"} />
              <SummaryCard label="Next follow-up" value={customer.nextFollowUpAt ? formatDate(customer.nextFollowUpAt) : "-"} strong />
              <SummaryCard label="Outstanding" value={canSeeFinancials ? formatCurrency((customer.totalOutstandingCents || 0) / 100) : `${customer.openTaskCount} open tasks`} detail={canSeeFinancials ? `${customer.openTaskCount} open tasks` : `${customer.overdueTaskCount} overdue`} />
            </div>
          )}
        >
          {customer.phone ? (
            <a href={`tel:${customer.phone}`} className="hero-chip" style={{ textDecoration: "none" }}>
              <Phone size={13} />
              {customer.phone}
            </a>
          ) : null}
          {customer.email ? (
            <a href={`mailto:${customer.email}`} className="hero-chip" style={{ textDecoration: "none" }}>
              <Mail size={13} />
              {customer.email}
            </a>
          ) : null}
          {(customer.repNames || []).length > 0 ? (
            <span className="hero-chip">
              <UserRound size={13} />
              Rep: {customer.repNames.join(", ")}
            </span>
          ) : null}
          <span className="hero-chip">{customer.totalJobCount} total job{customer.totalJobCount === 1 ? "" : "s"}</span>
        </WorkspaceHeader>
      </div>

      {message.text ? (
        <div
          style={{
            marginBottom: 14,
            padding: "10px 12px",
            borderRadius: "var(--radius-md)",
            background: message.type === "error" ? "#fee2e2" : "#dcfce7",
            color: message.type === "error" ? "#991b1b" : "#166534",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {message.text}
        </div>
      ) : null}

      <div className="detail-shell">
        <div className="detail-main">
          <div className="card detail-panel">
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 12 }}>Relationship summary</div>
            <div className="detail-summary-grid four">
              <SummaryCard label="Total jobs" value={customer.totalJobCount} detail={`${customer.activeJobCount} active`} />
              <SummaryCard label="At-risk jobs" value={customer.atRiskJobCount} detail={`${customer.closedJobCount} closed`} strong={customer.atRiskJobCount > 0} />
              <SummaryCard label="Open tasks" value={customer.openTaskCount} detail={`${customer.overdueTaskCount} overdue`} strong={customer.overdueTaskCount > 0} />
              <SummaryCard label="Owner" value={customer.followUpOwners?.[0] || "Unassigned"} detail={(customer.followUpOwners || []).slice(1).join(", ")} />
            </div>
          </div>

          <div className="card detail-panel">
            <div className="detail-panel-header">
              <MessageSquareMore size={15} style={{ color: "var(--amber)" }} />
              <div className="detail-panel-title">Related jobs</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {jobs.map((job) => {
                const status = statusMeta(job.currentStatus);
                return (
                  <Link key={job.id} href={`/jobs/${job.jobNumber}`} style={{ textDecoration: "none" }}>
                    <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "12px 14px", background: job.isAtRisk ? "#fff2f0" : "var(--surface-2)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span className="mono badge badge-slate">{job.jobNumber}</span>
                          <span className={`badge ${status.badge}`}>{status.label}</span>
                          {job.openTaskCount > 0 ? <span className={`badge ${job.overdueTaskCount > 0 ? "badge-red" : "badge-amber"}`}>{job.openTaskCount} open task{job.openTaskCount === 1 ? "" : "s"}</span> : null}
                        </div>
                        <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{formatDate(job.currentStatusChangedAt)}</div>
                      </div>
                      <div className="detail-info-grid four" style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                        <div>Rep: <strong style={{ color: "var(--text-primary)" }}>{job.repName || "-"}</strong></div>
                        <div>Owner: <strong style={{ color: "var(--text-primary)" }}>{job.followUpOwnerName || "-"}</strong></div>
                        <div>Follow-up: <strong style={{ color: "var(--text-primary)" }}>{formatDate(job.nextFollowUpAt)}</strong></div>
                        <div>{canSeeFinancials ? <>Outstanding: <strong style={{ color: "var(--text-primary)" }}>{formatCurrency((job.outstandingCents || 0) / 100)}</strong></> : <>Last contact: <strong style={{ color: "var(--text-primary)" }}>{formatDate(job.lastContactAt)}</strong></>}</div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="card detail-panel">
            <div className="detail-panel-header">
              <MessageSquareMore size={15} style={{ color: "var(--amber)" }} />
              <div className="detail-panel-title">Communication timeline</div>
            </div>
            {contactLog.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {contactLog.map((entry) => (
                  <div key={entry.id} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "12px 14px", background: "var(--surface-2)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 5 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span className={`badge ${entry.direction === "internal" ? "badge-slate" : entry.direction === "inbound" ? "badge-green" : "badge-blue"}`}>{formatLabel(entry.channel)}</span>
                        <span className="mono badge badge-slate">{entry.jobNumber}</span>
                        <div style={{ fontWeight: 700 }}>{entry.summary}</div>
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                        <DateTimeStack value={entry.contactedAt} align="right" />
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>{entry.details || "No extra details logged."}</div>
                    <div style={{ marginTop: 6, fontSize: 11, color: "var(--text-tertiary)" }}>Logged by {entry.createdByName || "Unknown user"}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state" style={{ padding: 24 }}>No communication history is logged yet.</div>
            )}
          </div>
        </div>

        <div className="detail-rail">
          <div className="card detail-panel">
            <div className="detail-panel-header">
              <NotebookPen size={15} style={{ color: "var(--amber)" }} />
              <div className="detail-panel-title">Relationship actions</div>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
              {customer.phone ? (
                <a href={`tel:${customer.phone}`} className="btn btn-outline">
                  <Phone size={13} />
                  Call homeowner
                </a>
              ) : null}
              {customer.email ? (
                <a href={`mailto:${customer.email}`} className="btn btn-outline">
                  <Mail size={13} />
                  Email homeowner
                </a>
              ) : null}
            </div>

            {!crmInstalled ? (
              <div style={{ padding: "12px 14px", borderRadius: "var(--radius-md)", background: "#fff8e8", border: "1px solid #f3d489", color: "#8a5308", fontSize: 13, lineHeight: 1.6 }}>
                Apply `db/migrations/003_job_crm_workspace.sql` to enable customer follow-up logging and tasks.
              </div>
            ) : canManageOps ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div className="composer-toolbar">
                  <button type="button" className={`composer-chip ${composers.contact ? "active" : ""}`} onClick={() => toggleComposer("contact")}>
                    {composers.contact ? "Hide communication log" : "Log communication"}
                  </button>
                  <button type="button" className={`composer-chip ${composers.task ? "active" : ""}`} onClick={() => toggleComposer("task")}>
                    {composers.task ? "Hide task composer" : "Create task"}
                  </button>
                </div>
                {composers.contact ? (
                  <ComposerCard
                    title="Log communication"
                    description="Capture the latest homeowner update at the relationship level or attach it to a specific job."
                    onClose={() => closeComposer("contact")}
                  >
                    <form onSubmit={handleContactSubmit} style={{ display: "grid", gap: 10 }}>
                    <select value={contactForm.jobId} onChange={(event) => setContactForm((prev) => ({ ...prev, jobId: event.target.value }))}>
                      <option value="">Relationship default{primaryJob ? ` (${primaryJob.jobNumber})` : ""}</option>
                      {jobs.map((job) => (
                        <option key={job.id} value={job.id}>
                          {job.jobNumber} · {statusMeta(job.currentStatus).label}
                        </option>
                      ))}
                    </select>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <select value={contactForm.channel} onChange={(event) => setContactForm((prev) => ({ ...prev, channel: event.target.value }))}>
                        {CONTACT_CHANNELS.map((channel) => <option key={channel} value={channel}>{formatLabel(channel)}</option>)}
                      </select>
                      <select value={contactForm.direction} onChange={(event) => setContactForm((prev) => ({ ...prev, direction: event.target.value }))}>
                        {CONTACT_DIRECTIONS.map((direction) => <option key={direction} value={direction}>{formatLabel(direction)}</option>)}
                      </select>
                    </div>
                    <input value={contactForm.summary} onChange={(event) => setContactForm((prev) => ({ ...prev, summary: event.target.value }))} placeholder="What happened with the homeowner?" />
                    <textarea rows={3} value={contactForm.details} onChange={(event) => setContactForm((prev) => ({ ...prev, details: event.target.value }))} placeholder="Promise made, concern raised, next step..." style={{ resize: "vertical" }} />
                    <input type="datetime-local" value={contactForm.contactedAt} onChange={(event) => setContactForm((prev) => ({ ...prev, contactedAt: event.target.value }))} />
                      <div style={{ display: "flex", justifyContent: "flex-end" }}>
                        <button className="btn btn-outline" type="submit">Add communication log</button>
                      </div>
                    </form>
                  </ComposerCard>
                ) : null}
                {composers.task ? (
                  <ComposerCard
                    title="Create follow-up task"
                    description="Assign the next commitment before it slips into a note or text thread."
                    onClose={() => closeComposer("task")}
                  >
                    <form onSubmit={handleTaskSubmit} style={{ display: "grid", gap: 10 }}>
                    <select value={taskForm.jobId} onChange={(event) => setTaskForm((prev) => ({ ...prev, jobId: event.target.value }))}>
                      <option value="">Relationship default{primaryJob ? ` (${primaryJob.jobNumber})` : ""}</option>
                      {jobs.map((job) => (
                        <option key={job.id} value={job.id}>
                          {job.jobNumber} · {statusMeta(job.currentStatus).label}
                        </option>
                      ))}
                    </select>
                    <input value={taskForm.title} onChange={(event) => setTaskForm((prev) => ({ ...prev, title: event.target.value }))} placeholder="Create a relationship follow-up task" />
                    <textarea rows={3} value={taskForm.details} onChange={(event) => setTaskForm((prev) => ({ ...prev, details: event.target.value }))} placeholder="What exactly needs to happen next?" style={{ resize: "vertical" }} />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <select value={taskForm.priority} onChange={(event) => setTaskForm((prev) => ({ ...prev, priority: event.target.value }))}>
                        {TASK_PRIORITIES.map((priority) => <option key={priority} value={priority}>{formatLabel(priority)}</option>)}
                      </select>
                      <input type="date" value={taskForm.dueAt} onChange={(event) => setTaskForm((prev) => ({ ...prev, dueAt: event.target.value }))} />
                    </div>
                    <select value={taskForm.ownerUserId} onChange={(event) => setTaskForm((prev) => ({ ...prev, ownerUserId: event.target.value }))}>
                      <option value="">No owner yet</option>
                      {ownerOptions.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.name} · {formatLabel(member.role)}
                        </option>
                      ))}
                    </select>
                      <div style={{ display: "flex", justifyContent: "flex-end" }}>
                        <button className="btn btn-outline" type="submit">Create task</button>
                      </div>
                    </form>
                  </ComposerCard>
                ) : null}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                Ops and admin users can log communication and create follow-up tasks from this customer view.
              </div>
            )}
          </div>

          <div className="card detail-panel">
            <div className="detail-panel-header">
              <CalendarDays size={15} style={{ color: "var(--amber)" }} />
              <div className="detail-panel-title">Open commitments</div>
            </div>
            {tasks.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {tasks.map((task) => (
                  <div key={task.id} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "12px 14px", background: task.status === "done" ? "var(--surface)" : isOverdueTask(task) ? "#fff2f0" : "var(--surface-2)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span className="mono badge badge-slate">{task.jobNumber}</span>
                        <span className={`badge ${task.priority === "high" ? "badge-red" : task.priority === "medium" ? "badge-amber" : "badge-slate"}`}>{formatLabel(task.priority)}</span>
                        <span className={`badge ${task.status === "done" ? "badge-green" : task.status === "in_progress" ? "badge-blue" : "badge-amber"}`}>{formatLabel(task.status)}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{formatDate(task.dueAt)}</div>
                    </div>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>{task.title}</div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>{task.details || "No extra details on this task."}</div>
                    <div style={{ marginTop: 6, fontSize: 11, color: "var(--text-tertiary)" }}>Owner: {task.ownerName || "Unassigned"} · Created by {task.createdByName || "Unknown user"}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state" style={{ padding: 24 }}>No follow-up tasks are open across this customer relationship.</div>
            )}
          </div>

          <div className="card detail-panel">
            <div className="detail-panel-header">
              <AlertTriangle size={15} style={{ color: "var(--amber)" }} />
              <div className="detail-panel-title">Relationship activity</div>
            </div>
            {history.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {history.slice(0, 14).map((item) => (
                  <div key={item.id} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "12px 14px", background: "var(--surface-2)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 5 }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>{EventLabel(item)}</div>
                        <div style={{ marginTop: 2, fontSize: 12, color: "var(--text-secondary)" }}>{item.changedByName || "System / unknown user"} · {item.jobNumber}</div>
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
            ) : (
              <div className="empty-state" style={{ padding: 24 }}>No relationship activity is available yet.</div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
