"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useUserRole } from "@/lib/useUserRole";
import { ArrowRight, CheckCircle2, Clock3, Lock, Phone, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";

const STATUS_LABELS = {
  created: "Created",
  scheduled: "Scheduled",
  install_completed: "Install complete",
  inspection_scheduled: "Inspection scheduled",
  inspection_passed: "Inspection passed",
  inspection_failed: "Inspection failed",
  pto_submitted: "PTO submitted",
  pto_granted: "PTO granted",
  m1_invoiced: "M1 invoiced",
  m1_partially_paid: "M1 partial",
  m1_paid: "M1 paid",
  m2_invoiced: "M2 invoiced",
  m2_partially_paid: "M2 partial",
  paid_in_full: "Paid in full",
  on_hold: "On hold",
  cancelled: "Cancelled",
};

function humanizeStatus(status) {
  return STATUS_LABELS[status] || "Unknown";
}

function dayLabel(value, singular = "day", plural = "days") {
  const amount = Number(value || 0);
  return `${amount} ${amount === 1 ? singular : plural}`;
}

function WorklistCard({ title, detail, href, cta, tone = "slate", children }) {
  const accent = tone === "red"
    ? { border: "#f5c4be", bg: "#fff6f4", text: "#8f3529" }
    : tone === "amber"
      ? { border: "#f3d489", bg: "#fff9ee", text: "#7a520b" }
      : tone === "green"
        ? { border: "#b8e6c8", bg: "#eefbf4", text: "#1d4f3f" }
        : { border: "var(--border)", bg: "var(--surface)", text: "var(--text-primary)" };

  return (
    <div
      className="card"
      style={{
        padding: "18px 20px",
        border: `1px solid ${accent.border}`,
        background: accent.bg,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 14, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15, color: accent.text }}>{title}</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4, maxWidth: 520 }}>{detail}</div>
        </div>
        {href ? (
          <Link href={href} style={{ fontSize: 12, fontWeight: 700, color: accent.text, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
            {cta || "Open"}
            <ArrowRight size={12} />
          </Link>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function EmptyState({ children }) {
  return (
    <div style={{ padding: "18px 16px", borderRadius: "var(--radius-md)", border: "1px dashed var(--border)", color: "var(--text-secondary)", fontSize: 12 }}>
      {children}
    </div>
  );
}

function LabelPill({ children, tone = "slate" }) {
  const colors = tone === "red"
    ? { bg: "#fff0ee", color: "#b53a2d" }
    : tone === "amber"
      ? { bg: "#fff7df", color: "#8a5c10" }
      : tone === "green"
        ? { bg: "#eefbf4", color: "#1d4f3f" }
        : { bg: "var(--surface-2)", color: "var(--text-secondary)" };

  return (
    <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 999, padding: "4px 8px", background: colors.bg, color: colors.color }}>
      {children}
    </span>
  );
}

function JobLinks({ jobPath, jobNumber, customerPath }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <Link href={jobPath} style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", textDecoration: "none" }}>
        Job {jobNumber}
      </Link>
      {customerPath ? (
        <Link href={customerPath} style={{ fontSize: 12, color: "var(--text-secondary)", textDecoration: "none" }}>
          Customer record
        </Link>
      ) : null}
    </div>
  );
}

export default function ReportsPage() {
  const router = useRouter();
  const { loading: roleLoading, canSeeFinancials } = useUserRole();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!roleLoading && !canSeeFinancials) router.replace("/");
  }, [roleLoading, canSeeFinancials, router]);

  useEffect(() => {
    if (!canSeeFinancials) return;
    setLoading(true);
    fetch("/api/v2/reports")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setReport(data))
      .catch(() => setReport(null))
      .finally(() => setLoading(false));
  }, [canSeeFinancials]);

  const overview = report?.overview;
  const actionSummary = report?.actionSummary;
  const overdueInvoices = useMemo(() => report?.overdueInvoices || [], [report]);
  const staleJobs = useMemo(() => report?.staleJobs || [], [report]);
  const followUpGaps = useMemo(() => report?.followUpGaps || [], [report]);
  const readyToAdvance = useMemo(() => report?.readyToAdvance || [], [report]);
  const ownerPressure = useMemo(() => report?.ownerPressure || [], [report]);
  const invoicesByStatus = useMemo(() => report?.invoicesByStatus || [], [report]);
  const jobsByStatus = useMemo(() => report?.jobsByStatus || [], [report]);
  const topReps = useMemo(() => report?.topReps || [], [report]);

  const collectionRate = useMemo(() => {
    if (!overview?.total_invoiced_cents) return 0;
    return Math.round(((overview.total_collected_cents || 0) / overview.total_invoiced_cents) * 100);
  }, [overview]);

  if (roleLoading || loading) {
    return (
      <AppShell>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300, color: "var(--text-tertiary)" }}>
          Loading...
        </div>
      </AppShell>
    );
  }

  if (!canSeeFinancials) {
    return (
      <AppShell>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 300, gap: 12, color: "var(--text-tertiary)" }}>
          <Lock size={32} />
          <div style={{ fontWeight: 600, color: "var(--text-secondary)" }}>Access restricted</div>
          <div style={{ fontSize: 13 }}>Reports are only visible to financial roles.</div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="page-header">
        <h1>Owner worklist</h1>
        <p>Use this page to decide where cash, follow-up, and pipeline attention should go next instead of reading passive totals.</p>
      </div>

      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-label">Overdue balance</div>
          <div className="stat-value" style={{ color: (actionSummary?.overdueOutstandingCents || 0) > 0 ? "var(--red)" : "var(--green)" }}>
            {formatCurrency((actionSummary?.overdueOutstandingCents || 0) / 100)}
          </div>
          <div className="stat-detail">{actionSummary?.overdueInvoiceCount || 0} invoices to collect</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Stalled jobs</div>
          <div className="stat-value" style={{ color: (actionSummary?.staleJobCount || 0) > 0 ? "var(--amber)" : "var(--green)" }}>
            {actionSummary?.staleJobCount || 0}
          </div>
          <div className="stat-detail">Past their status-age threshold</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">CRM gaps</div>
          <div className="stat-value" style={{ color: (actionSummary?.followUpGapCount || 0) > 0 ? "var(--amber)" : "var(--green)" }}>
            {actionSummary?.followUpGapCount || 0}
          </div>
          <div className="stat-detail">Missing owner, next date, or recent contact</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Ready to advance</div>
          <div className="stat-value" style={{ color: (actionSummary?.readyToAdvanceCount || 0) > 0 ? "var(--blue)" : "var(--text-primary)" }}>
            {actionSummary?.readyToAdvanceCount || 0}
          </div>
          <div className="stat-detail">Jobs waiting on one good push</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginBottom: 16, alignItems: "flex-start" }}>
        <WorklistCard
          title="Cash to collect now"
          detail="These invoices are already overdue, so this is the fastest place to reduce leakage."
          href="/invoices?status=Overdue"
          cta="Open invoices"
          tone={(actionSummary?.overdueInvoiceCount || 0) > 0 ? "red" : "green"}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {overdueInvoices.length > 0 ? overdueInvoices.map((invoice) => (
              <div key={invoice.id} style={{ padding: "13px 14px", borderRadius: "var(--radius-md)", background: "rgba(255,255,255,0.7)", border: "1px solid #f5c4be" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 8 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                      <div style={{ fontWeight: 800 }}>{invoice.customerName}</div>
                      <LabelPill tone="red">{dayLabel(invoice.daysOverdue)} overdue</LabelPill>
                      <LabelPill>{invoice.invoiceType}</LabelPill>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      Invoice {invoice.invoiceNumber} | Rep: {invoice.repName}
                      {invoice.followUpOwnerName ? ` | Owner: ${invoice.followUpOwnerName}` : ""}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 800, color: "var(--red)" }}>{formatCurrency(invoice.balanceCents / 100)}</div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Due {formatDate(invoice.dueAt)}</div>
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <JobLinks jobPath={invoice.jobPath} jobNumber={invoice.jobNumber} customerPath={invoice.customerPath} />
                  <Link href={`/invoices/${invoice.id}`} style={{ fontSize: 12, fontWeight: 700, color: "var(--red)", textDecoration: "none" }}>
                    Open invoice
                  </Link>
                </div>
              </div>
            )) : <EmptyState>No overdue invoices are open right now.</EmptyState>}
          </div>
        </WorklistCard>

        <WorklistCard
          title="Financial pulse"
          detail="Keep a lightweight summary here, but let the worklists drive the real decisions."
          tone="slate"
        >
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ padding: "12px 14px", borderRadius: "var(--radius-md)", background: "var(--surface-2)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: 5 }}>Collection rate</div>
              <div style={{ fontSize: 26, fontWeight: 800 }}>{collectionRate}%</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                {formatCurrency((overview?.total_collected_cents || 0) / 100)} collected from {formatCurrency((overview?.total_invoiced_cents || 0) / 100)} invoiced
              </div>
            </div>
            <div style={{ padding: "12px 14px", borderRadius: "var(--radius-md)", background: "var(--surface-2)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: 8 }}>Pipeline pressure</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {jobsByStatus.slice(0, 5).map((row) => (
                  <div key={row.status} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12 }}>
                    <span style={{ color: "var(--text-secondary)" }}>{humanizeStatus(row.status)}</span>
                    <span style={{ fontWeight: 700 }}>{row.count}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ padding: "12px 14px", borderRadius: "var(--radius-md)", background: "var(--surface-2)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: 8 }}>Invoice mix</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {invoicesByStatus.slice(0, 4).map((row) => (
                  <div key={row.status} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12 }}>
                    <span style={{ color: "var(--text-secondary)", textTransform: "capitalize" }}>{row.status.replaceAll("_", " ")}</span>
                    <span style={{ fontWeight: 700 }}>{formatCurrency((row.balance_cents || 0) / 100)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </WorklistCard>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16, alignItems: "flex-start" }}>
        <WorklistCard
          title="Jobs stalled in place"
          detail="These jobs have been sitting in their current stage longer than they should."
          href="/jobs?focus=stalled"
          cta="Open jobs"
          tone={staleJobs.length > 0 ? "amber" : "green"}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {staleJobs.length > 0 ? staleJobs.map((job) => (
              <div key={job.id} style={{ padding: "13px 14px", borderRadius: "var(--radius-md)", background: "rgba(255,255,255,0.7)", border: "1px solid #f3d489" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 8 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                      <div style={{ fontWeight: 800 }}>{job.customerName}</div>
                      <LabelPill tone="amber">{humanizeStatus(job.currentStatus)}</LabelPill>
                      <LabelPill tone="amber">{dayLabel(job.statusAgeDays)} in lane</LabelPill>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      Owner: {job.ownerName} | Threshold: {dayLabel(job.staleAfterDays)}
                    </div>
                  </div>
                  {job.outstandingCents > 0 ? (
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 800, color: "var(--amber)" }}>{formatCurrency(job.outstandingCents / 100)}</div>
                      <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>still open</div>
                    </div>
                  ) : null}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    Last contact {formatDate(job.lastContactAt)} | Next follow-up {formatDate(job.nextFollowUpAt)}
                  </div>
                  <JobLinks jobPath={job.jobPath} jobNumber={job.jobNumber} customerPath={job.customerPath} />
                </div>
              </div>
            )) : <EmptyState>No jobs are currently sitting past their stage threshold.</EmptyState>}
          </div>
        </WorklistCard>

        <WorklistCard
          title="CRM cleanup that blocks momentum"
          detail="These records are missing ownership or a believable next step, so they are easy to forget."
          href="/customers?filter=needsFollowUp&sort=attention"
          cta="Open customers"
          tone={followUpGaps.length > 0 ? "amber" : "green"}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {followUpGaps.length > 0 ? followUpGaps.map((job) => (
              <div key={job.id} style={{ padding: "13px 14px", borderRadius: "var(--radius-md)", background: "rgba(255,255,255,0.7)", border: "1px solid var(--border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 8 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                      <div style={{ fontWeight: 800 }}>{job.customerName}</div>
                      <LabelPill tone="amber">{job.gapReason}</LabelPill>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      Owner: {job.ownerName} | {humanizeStatus(job.currentStatus)}
                    </div>
                  </div>
                  {job.overdueTaskCount > 0 ? <LabelPill tone="red">{job.overdueTaskCount} overdue task{job.overdueTaskCount === 1 ? "" : "s"}</LabelPill> : null}
                </div>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12, color: "var(--text-secondary)", marginBottom: 8 }}>
                  <span>Last contact {formatDate(job.lastContactAt)}</span>
                  <span>Next follow-up {formatDate(job.nextFollowUpAt)}</span>
                  <span>{job.openTaskCount || 0} open task{job.openTaskCount === 1 ? "" : "s"}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 12, color: "var(--text-secondary)" }}>
                    {job.customerPhone ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Phone size={12} />{job.customerPhone}</span> : <span>Phone missing</span>}
                    <span>{job.customerEmail || "Email missing"}</span>
                  </div>
                  <JobLinks jobPath={job.jobPath} jobNumber={job.jobNumber} customerPath={job.customerPath} />
                </div>
              </div>
            )) : <EmptyState>The CRM follow-up layer is clean right now.</EmptyState>}
          </div>
        </WorklistCard>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "flex-start" }}>
        <WorklistCard
          title="Ready to move with one push"
          detail="These jobs are already at a transition point. A fast handoff here keeps projects from feeling stuck."
          href="/jobs?focus=readyToAdvance"
          cta="Open jobs"
          tone={readyToAdvance.length > 0 ? "green" : "slate"}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {readyToAdvance.length > 0 ? readyToAdvance.map((job) => (
              <div key={job.id} style={{ padding: "13px 14px", borderRadius: "var(--radius-md)", background: "rgba(255,255,255,0.8)", border: "1px solid #b8e6c8" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 8 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                      <div style={{ fontWeight: 800 }}>{job.customerName}</div>
                      <LabelPill tone="green">{humanizeStatus(job.currentStatus)}</LabelPill>
                      <LabelPill tone="green">{dayLabel(job.waitingDays)} waiting</LabelPill>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      {job.recommendedAction}
                    </div>
                  </div>
                  {job.outstandingCents > 0 ? <LabelPill tone="amber">{formatCurrency(job.outstandingCents / 100)} open</LabelPill> : <CheckCircle2 size={16} style={{ color: "var(--green)" }} />}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Owner: {job.ownerName}</div>
                  <JobLinks jobPath={job.jobPath} jobNumber={job.jobNumber} customerPath={job.customerPath} />
                </div>
              </div>
            )) : <EmptyState>Nothing is lingering at an obvious handoff point right now.</EmptyState>}
          </div>
        </WorklistCard>

        <WorklistCard
          title="Ownership pressure"
          detail="This is where workload and risk are clustering so you can coach or redistribute before things slip."
          tone="slate"
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {ownerPressure.length > 0 ? ownerPressure.map((owner) => (
              <div key={owner.ownerName} style={{ padding: "13px 14px", borderRadius: "var(--radius-md)", background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 8 }}>
                  <div style={{ fontWeight: 800 }}>{owner.ownerName}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>{owner.activeJobs} active</div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                  {owner.staleJobs > 0 ? <LabelPill tone="amber">{owner.staleJobs} stale</LabelPill> : null}
                  {owner.followUpGaps > 0 ? <LabelPill tone="amber">{owner.followUpGaps} CRM gaps</LabelPill> : null}
                  {owner.readyToAdvance > 0 ? <LabelPill tone="green">{owner.readyToAdvance} ready</LabelPill> : null}
                  {owner.overdueInvoices > 0 ? <LabelPill tone="red">{owner.overdueInvoices} overdue invoice{owner.overdueInvoices === 1 ? "" : "s"}</LabelPill> : null}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  Overdue balance: {formatCurrency((owner.overdueBalanceCents || 0) / 100)}
                </div>
              </div>
            )) : <EmptyState>Ownership pressure will show up once there is real work to distribute.</EmptyState>}
          </div>

          <div style={{ marginTop: 16, padding: "14px 16px", borderRadius: "var(--radius-md)", background: "#fff9ee", border: "1px solid #f3d489" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 800, color: "#7a520b", marginBottom: 6 }}>
              <ShieldAlert size={14} />
              Why this version is better
            </div>
            <div style={{ fontSize: 12, color: "#926718", lineHeight: 1.7 }}>
              The old reports page told you what had happened. This version is built to tell you what to do next.
            </div>
          </div>

          {topReps.length > 0 ? (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 800, fontSize: 13, marginBottom: 10 }}>
                <Clock3 size={14} />
                Top reps by invoiced value
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {topReps.slice(0, 4).map((rep) => (
                  <div key={rep.rep_name} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12 }}>
                    <span style={{ color: "var(--text-secondary)" }}>{rep.rep_name}</span>
                    <span style={{ fontWeight: 700 }}>{formatCurrency((rep.total_invoiced_cents || 0) / 100)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </WorklistCard>
      </div>
    </AppShell>
  );
}
