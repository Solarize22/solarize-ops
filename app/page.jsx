"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CircleDollarSign,
  ClipboardList,
  Clock3,
  Mail,
  Phone,
  Search,
  ShieldAlert,
  UserRoundSearch,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import { formatCurrency, formatDate, getJobWorkflowDate } from "@/lib/utils";
import { useUserRole } from "@/lib/useUserRole";

const STATUS_META = {
  created: { label: "Created", tone: "slate" },
  scheduled: { label: "Scheduled", tone: "blue" },
  install_completed: { label: "Install complete", tone: "green" },
  inspection_scheduled: { label: "Inspection scheduled", tone: "blue" },
  inspection_passed: { label: "Inspection passed", tone: "green" },
  inspection_failed: { label: "Inspection failed", tone: "red" },
  pto_submitted: { label: "PTO submitted", tone: "amber" },
  pto_granted: { label: "PTO granted", tone: "violet" },
  m1_invoiced: { label: "M1 invoiced", tone: "violet" },
  m1_partially_paid: { label: "M1 partial", tone: "amber" },
  m1_paid: { label: "M1 paid", tone: "green" },
  m2_invoiced: { label: "M2 invoiced", tone: "violet" },
  m2_partially_paid: { label: "M2 partial", tone: "amber" },
  paid_in_full: { label: "Paid in full", tone: "slate" },
  on_hold: { label: "On hold", tone: "red" },
  cancelled: { label: "Cancelled", tone: "slate" },
};

const TONE_STYLES = {
  slate: { bg: "var(--surface-2)", border: "var(--border)", text: "var(--text-primary)", subtext: "var(--text-secondary)", badge: "badge-slate" },
  blue: { bg: "#eff6ff", border: "#bfdbfe", text: "#163a67", subtext: "#36567b", badge: "badge-blue" },
  green: { bg: "#eefbf4", border: "#b8e6c8", text: "#1d4f3f", subtext: "#356655", badge: "badge-green" },
  amber: { bg: "#fff8e8", border: "#f3d489", text: "#7a520b", subtext: "#926718", badge: "badge-amber" },
  red: { bg: "#fff2f0", border: "#f5c4be", text: "#8f3529", subtext: "#aa493b", badge: "badge-red" },
  violet: { bg: "#f5f3ff", border: "#ddd6fe", text: "#5f3dc4", subtext: "#7154c8", badge: "badge-slate" },
};

const STALE_THRESHOLDS = {
  created: 5,
  scheduled: 2,
  install_completed: 3,
  inspection_scheduled: 2,
  inspection_passed: 3,
  inspection_failed: 1,
  pto_submitted: 7,
  pto_granted: 3,
  m1_invoiced: 5,
  m1_partially_paid: 4,
  m1_paid: 5,
  m2_invoiced: 5,
  m2_partially_paid: 4,
  on_hold: 2,
};

function statusMeta(status) {
  return STATUS_META[status] || STATUS_META.created;
}

function parseDateValue(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfDay(value) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function isSameDay(left, right) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

function daysSince(value) {
  const parsed = parseDateValue(value);
  if (!parsed) return null;
  const diff = startOfDay(new Date()).getTime() - startOfDay(parsed).getTime();
  return Math.floor(diff / 86400000);
}

function daysUntil(value) {
  const parsed = parseDateValue(value);
  if (!parsed) return null;
  const diff = startOfDay(parsed).getTime() - startOfDay(new Date()).getTime();
  return Math.floor(diff / 86400000);
}

function jobAddress(job) {
  return [job.address?.street1, job.address?.city, job.address?.state].filter(Boolean).join(", ") || "-";
}

function quickActionLabel(job, canSeeFinancials) {
  switch (job.currentStatus) {
    case "created":
      return "Book the install and lock the homeowner touchpoint.";
    case "scheduled":
      return "Confirm date, access, and crew before install day.";
    case "install_completed":
      return canSeeFinancials ? "Send M1 and confirm the next homeowner expectation." : "Move inspection planning forward.";
    case "inspection_scheduled":
      return "Confirm the inspection appointment and keep the customer informed.";
    case "inspection_failed":
      return "Call the homeowner, fix the blocker, and reschedule fast.";
    case "inspection_passed":
      return "Push PTO and let the homeowner know what happens next.";
    case "pto_submitted":
      return "Follow up with the utility and keep the homeowner warm.";
    case "pto_granted":
      return canSeeFinancials ? "Send final billing and close the loop cleanly." : "Coordinate final closeout.";
    case "m1_invoiced":
    case "m1_partially_paid":
      return "Follow up on M1 so the project does not stall in billing.";
    case "m1_paid":
      return canSeeFinancials ? "Prepare final billing." : "Watch PTO and final closeout.";
    case "m2_invoiced":
    case "m2_partially_paid":
      return "Collect final payment and close the relationship well.";
    case "on_hold":
      return "Own the blocker and give the homeowner a clear update.";
    default:
      return "Review the record and decide the next touchpoint.";
  }
}

function buildFollowUpQueue(jobs, serviceItems, scheduleItems, canSeeFinancials) {
  const serviceByJob = new Map();
  const nextEventByJob = new Map();

  serviceItems.forEach((item) => {
    const key = item.jobNumber || item.jobId;
    if (!key) return;
    const existing = serviceByJob.get(key);
    if (!existing || item.urgency === "High") {
      serviceByJob.set(key, item);
    }
  });

  scheduleItems.forEach((item) => {
    const key = item.jobNumber || item.jobId;
    if (!key) return;
    const existing = nextEventByJob.get(key);
    if (!existing || String(item.date) < String(existing.date)) {
      nextEventByJob.set(key, item);
    }
  });

  return jobs
    .filter((job) => !["paid_in_full", "cancelled"].includes(job.currentStatus))
    .map((job) => {
      const status = statusMeta(job.currentStatus);
      const workflowDate = getJobWorkflowDate(job);
      const workflowAge = daysSince(workflowDate);
      const nextEvent = nextEventByJob.get(job.jobNumber) || nextEventByJob.get(job.id) || null;
      const serviceItem = serviceByJob.get(job.jobNumber) || serviceByJob.get(job.id) || null;
      const installDaysAway = daysUntil(job.installScheduledAt);
      const outstandingCents = job.financialSummary?.outstandingCents || 0;
      const missingContact = !job.customerPhone || !job.customerEmail;
      const staleThreshold = STALE_THRESHOLDS[job.currentStatus];

      let score = 0;
      let tone = status.tone;
      let reason = "";

      if (serviceItem?.urgency === "High") {
        score = 100;
        tone = "red";
        reason = serviceItem.issue;
      } else if (job.currentStatus === "inspection_failed") {
        score = 96;
        tone = "red";
        reason = "Failed inspection needs a homeowner update and correction plan.";
      } else if (job.currentStatus === "on_hold") {
        score = 92;
        tone = "red";
        reason = "This project is blocked and should not sit quietly.";
      } else if (job.currentStatus === "pto_submitted" && workflowAge !== null && workflowAge >= 7) {
        score = 86;
        tone = "amber";
        reason = `PTO has been sitting for ${workflowAge} days.`;
      } else if (canSeeFinancials && outstandingCents > 0 && ["m1_invoiced", "m1_partially_paid", "m2_invoiced", "m2_partially_paid"].includes(job.currentStatus)) {
        score = 82;
        tone = workflowAge !== null && workflowAge >= 7 ? "red" : "amber";
        reason = `${formatCurrency(outstandingCents / 100)} is still open on this job.`;
      } else if (job.currentStatus === "install_completed" && workflowAge !== null && workflowAge >= 2) {
        score = 77;
        tone = canSeeFinancials ? "green" : "blue";
        reason = canSeeFinancials ? "Install is done and M1 should move now." : "Install is done and inspection should be pushed next.";
      } else if (job.currentStatus === "inspection_passed" && workflowAge !== null && workflowAge >= 2) {
        score = 74;
        tone = "amber";
        reason = "Inspection passed. PTO follow-through is the next customer expectation.";
      } else if (job.currentStatus === "scheduled" && installDaysAway !== null && installDaysAway <= 2) {
        score = 72;
        tone = "blue";
        reason = installDaysAway <= 0 ? "Install day is here." : `Install is scheduled in ${installDaysAway} day${installDaysAway === 1 ? "" : "s"}.`;
      } else if (typeof staleThreshold === "number" && workflowAge !== null && workflowAge >= staleThreshold) {
        score = 66;
        tone = "slate";
        reason = `${status.label} has been idle for ${workflowAge} days.`;
      } else if (missingContact) {
        score = 58;
        tone = "amber";
        reason = "Customer contact info is incomplete.";
      } else if (nextEvent && daysUntil(nextEvent.date) !== null && daysUntil(nextEvent.date) <= 1) {
        score = 54;
        tone = "blue";
        reason = `${nextEvent.type} is coming up ${daysUntil(nextEvent.date) === 0 ? "today" : "tomorrow"}.`;
      } else {
        return null;
      }

      return {
        job,
        score,
        tone,
        reason,
        action: quickActionLabel(job, canSeeFinancials),
        workflowAge,
        nextEvent,
        serviceItem,
        missingContact,
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return (right.workflowAge || 0) - (left.workflowAge || 0);
    });
}

function MetricCard({ href, icon: Icon, label, value, detail, tone = "slate" }) {
  const colors = TONE_STYLES[tone] || TONE_STYLES.slate;

  return (
    <Link href={href} style={{ textDecoration: "none" }}>
      <div
        className="card"
        style={{
          padding: 18,
          minHeight: 146,
          background: colors.bg,
          border: `1px solid ${colors.border}`,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          gap: 14,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: colors.subtext, marginBottom: 8 }}>
              {label}
            </div>
            <div style={{ fontSize: 34, fontWeight: 800, lineHeight: 1, color: colors.text, marginBottom: 10 }}>
              {value}
            </div>
            <div style={{ fontSize: 13, color: colors.text, fontWeight: 600 }}>
              {detail}
            </div>
          </div>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 14,
              display: "grid",
              placeItems: "center",
              background: "rgba(255, 255, 255, 0.65)",
              color: colors.text,
              flexShrink: 0,
            }}
          >
            <Icon size={18} />
          </div>
        </div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: colors.text }}>
          Open
          <ArrowRight size={13} />
        </div>
      </div>
    </Link>
  );
}

function FollowUpCard({ item }) {
  const colors = TONE_STYLES[item.tone] || TONE_STYLES.slate;
  const status = statusMeta(item.job.currentStatus);

  return (
    <div
      onClick={() => { window.location.href = `/jobs/${item.job.jobNumber}`; }}
      style={{ textDecoration: "none", cursor: "pointer" }}
    >
      <div
        style={{
          padding: "14px 16px",
          borderRadius: "var(--radius-md)",
          border: `1px solid ${colors.border}`,
          background: colors.bg,
          display: "flex",
          justifyContent: "space-between",
          gap: 14,
          alignItems: "flex-start",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
            <div style={{ fontWeight: 800, color: colors.text }}>{item.job.customerName}</div>
            <span className="mono badge badge-slate">{item.job.jobNumber}</span>
            <span className={`badge ${TONE_STYLES[status.tone]?.badge || "badge-slate"}`}>{status.label}</span>
          </div>
          <div style={{ fontSize: 12, color: colors.subtext, marginBottom: 8 }}>
            {jobAddress(item.job)}
          </div>
          <div style={{ fontSize: 13, color: colors.text, fontWeight: 700, marginBottom: 4 }}>
            {item.reason}
          </div>
          <div style={{ fontSize: 12, color: colors.subtext, lineHeight: 1.6 }}>
            {item.action}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            {item.job.customerPhone ? (
              <a href={`tel:${item.job.customerPhone}`} onClick={(event) => event.stopPropagation()} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 700, color: colors.text }}>
                <Phone size={12} />
                {item.job.customerPhone}
              </a>
            ) : (
              <span style={{ fontSize: 12, color: colors.subtext }}>Phone missing</span>
            )}
            {item.job.customerEmail ? (
              <a href={`mailto:${item.job.customerEmail}`} onClick={(event) => event.stopPropagation()} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 700, color: colors.text }}>
                <Mail size={12} />
                Email
              </a>
            ) : (
              <span style={{ fontSize: 12, color: colors.subtext }}>Email missing</span>
            )}
            {item.job.customerPath ? (
              <Link
                href={item.job.customerPath}
                onClick={(event) => event.stopPropagation()}
                style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 700, color: colors.text, textDecoration: "none" }}
              >
                <UserRoundSearch size={12} />
                Customer record
              </Link>
            ) : null}
          </div>
        </div>
        <div style={{ fontSize: 12, color: colors.subtext, flexShrink: 0, textAlign: "right" }}>
          <div style={{ fontWeight: 700, color: colors.text, marginBottom: 4 }}>
            {formatDate(getJobWorkflowDate(item.job))}
          </div>
          <div>
            {item.workflowAge !== null ? `${item.workflowAge} day${item.workflowAge === 1 ? "" : "s"} in lane` : "Freshly updated"}
          </div>
        </div>
      </div>
    </div>
  );
}

function TouchpointRow({ item, kind = "schedule" }) {
  const isService = kind === "service";

  return (
    <Link href={isService ? "/service" : `/jobs/${item.jobNumber || item.jobId || item.id}`} style={{ textDecoration: "none" }}>
      <div
        style={{
          padding: "12px 14px",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--border)",
          background: isService ? "#fff4f1" : "var(--surface-2)",
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "flex-start",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
            <span className={`badge ${isService ? "badge-red" : "badge-blue"}`}>
              {isService ? item.urgency : item.type}
            </span>
            <div style={{ fontWeight: 700 }}>{isService ? item.customer : item.customerName}</div>
            <span className="mono badge badge-slate">{item.jobNumber}</span>
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>
            {isService ? item.issue : item.site}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            {isService
              ? `Assigned to ${item.assignedTo || "Unassigned"}`
              : `${formatDate(item.date)} | ${item.startTime} | ${(item.crewNames || []).join(", ") || "Crew TBD"}`}
          </div>
        </div>
        <div style={{ flexShrink: 0, fontSize: 12, color: "var(--text-secondary)" }}>
          <div style={{ fontWeight: 700, color: "var(--text-primary)", marginBottom: 3 }}>
            {isService ? item.status : item.status}
          </div>
          <div>{isService ? formatDate(item.createdDate) : "Open"}</div>
        </div>
      </div>
    </Link>
  );
}

export default function DashboardPage() {
  const { canSeeFinancials } = useUserRole();
  const [jobs, setJobs] = useState([]);
  const [serviceItems, setServiceItems] = useState([]);
  const [scheduleItems, setScheduleItems] = useState([]);
  const [report, setReport] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const requests = [
          fetch("/api/v2/jobs"),
          fetch("/api/v2/service"),
          fetch("/api/v2/schedule"),
        ];

        if (canSeeFinancials) {
          requests.push(fetch("/api/v2/reports"));
        }

        const responses = await Promise.all(requests);
        const [jobsRes, serviceRes, scheduleRes, reportsRes] = responses;

        if (cancelled) return;

        setJobs(jobsRes.ok ? await jobsRes.json() : []);
        setServiceItems(serviceRes.ok ? await serviceRes.json() : []);
        setScheduleItems(scheduleRes.ok ? await scheduleRes.json() : []);
        setReport(canSeeFinancials && reportsRes?.ok ? await reportsRes.json() : null);
      } catch {
        if (!cancelled) {
          setJobs([]);
          setServiceItems([]);
          setScheduleItems([]);
          setReport(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [canSeeFinancials]);

  const activeJobs = useMemo(() => {
    return jobs.filter((job) => !["paid_in_full", "cancelled"].includes(job.currentStatus));
  }, [jobs]);

  const followUpQueue = useMemo(() => {
    return buildFollowUpQueue(jobs, serviceItems, scheduleItems, canSeeFinancials);
  }, [jobs, serviceItems, scheduleItems, canSeeFinancials]);

  const today = useMemo(() => startOfDay(new Date()), []);

  const touchpoints = useMemo(() => {
    const parsedSchedule = scheduleItems
      .map((item) => ({ ...item, parsedDate: parseDateValue(item.date) }))
      .filter((item) => item.parsedDate);

    const schedule = parsedSchedule
      .filter((item) => {
        const daysAway = daysUntil(item.date);
        return daysAway !== null && daysAway >= 0 && daysAway <= 1;
      })
      .sort((left, right) => left.parsedDate.getTime() - right.parsedDate.getTime())
      .slice(0, 5);

    const urgentService = serviceItems
      .filter((item) => item.urgency === "High" && item.status !== "Resolved")
      .slice(0, 3);

    return { schedule, urgentService };
  }, [scheduleItems, serviceItems]);

  const searchResults = useMemo(() => {
    const normalized = searchTerm.trim().toLowerCase();
    const source = normalized
      ? jobs.filter((job) => {
        const haystack = [
          job.jobNumber,
          job.customerName,
          job.customerPhone,
          job.customerEmail,
          job.repName,
          jobAddress(job),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(normalized);
      })
      : followUpQueue.map((item) => item.job);

    const unique = [];
    const seen = new Set();

    source.forEach((job) => {
      if (!job || seen.has(job.id)) return;
      seen.add(job.id);
      unique.push(job);
    });

    return unique.slice(0, 6);
  }, [followUpQueue, jobs, searchTerm]);

  const atRiskCount = useMemo(() => {
    return followUpQueue.filter((item) => item.tone === "red").length;
  }, [followUpQueue]);

  const staleCount = useMemo(() => {
    return followUpQueue.filter((item) => item.workflowAge !== null && item.workflowAge >= 7).length;
  }, [followUpQueue]);

  const missingContactCount = useMemo(() => {
    return activeJobs.filter((job) => !job.customerPhone || !job.customerEmail).length;
  }, [activeJobs]);

  const readyToAdvanceCount = useMemo(() => {
    return activeJobs.filter((job) => ["install_completed", "inspection_passed", "pto_granted"].includes(job.currentStatus)).length;
  }, [activeJobs]);

  const repPressure = useMemo(() => {
    const map = new Map();

    activeJobs.forEach((job) => {
      const repName = job.repName || "Unassigned";
      if (!map.has(repName)) {
        map.set(repName, { repName, activeCount: 0, riskCount: 0, staleCount: 0 });
      }

      const entry = map.get(repName);
      entry.activeCount += 1;
    });

    followUpQueue.forEach((item) => {
      const repName = item.job.repName || "Unassigned";
      if (!map.has(repName)) {
        map.set(repName, { repName, activeCount: 0, riskCount: 0, staleCount: 0 });
      }

      const entry = map.get(repName);
      if (item.tone === "red") entry.riskCount += 1;
      if (item.workflowAge !== null && item.workflowAge >= 7) entry.staleCount += 1;
    });

    return [...map.values()]
      .sort((left, right) => {
        if (right.riskCount !== left.riskCount) return right.riskCount - left.riskCount;
        if (right.staleCount !== left.staleCount) return right.staleCount - left.staleCount;
        return right.activeCount - left.activeCount;
      })
      .slice(0, 5);
  }, [activeJobs, followUpQueue]);

  const focusCards = [
    {
      key: "followup",
      title: "Needs follow-up",
      value: followUpQueue.length,
      detail: `${staleCount} are sitting 7+ days without movement.`,
      href: "/jobs",
      icon: UserRoundSearch,
      tone: "slate",
    },
    {
      key: "risk",
      title: "At risk now",
      value: atRiskCount,
      detail: "Blocked jobs, failed inspections, and urgent service issues.",
      href: "/service",
      icon: ShieldAlert,
      tone: atRiskCount > 0 ? "red" : "green",
    },
    {
      key: "touchpoints",
      title: "Next 48 hours",
      value: touchpoints.schedule.length + touchpoints.urgentService.length,
      detail: `${touchpoints.schedule.length} field events and ${touchpoints.urgentService.length} urgent service items.`,
      href: "/scheduling",
      icon: CalendarDays,
      tone: "blue",
    },
    canSeeFinancials
      ? {
        key: "cash",
        title: "Cash at risk",
        value: formatCurrency((report?.overview?.overdue_outstanding_cents || 0) / 100),
        detail: `${report?.overview?.overdue_invoice_count || 0} overdue invoices need follow-up.`,
        href: "/invoices",
        icon: CircleDollarSign,
        tone: (report?.overview?.overdue_outstanding_cents || 0) > 0 ? "amber" : "green",
      }
      : {
        key: "advance",
        title: "Ready to advance",
        value: readyToAdvanceCount,
        detail: "Projects that can move with one good touchpoint.",
        href: "/jobs",
        icon: ClipboardList,
        tone: "green",
      },
  ];

  return (
    <AppShell>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 18, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 20 }}>
        <div className="page-header" style={{ marginBottom: 0, maxWidth: 760 }}>
          <h1>Command center</h1>
          <p>This version of the CRM leads with follow-up, risk, and customer context so you can see who needs attention before the pipeline slips.</p>
        </div>

        <div
          className="card"
          style={{
            padding: "14px 16px",
            minWidth: 290,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            background: "linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(245,248,251,0.98) 100%)",
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--text-tertiary)" }}>
            Workspace pulse
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700 }}>
            <Clock3 size={15} style={{ color: "var(--amber)" }} />
            {loading ? "Loading live pipeline..." : `${activeJobs.length} active jobs and ${followUpQueue.length} records worth opening first`}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
            {missingContactCount} job{missingContactCount === 1 ? "" : "s"} need cleaner customer contact data.
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginBottom: 20 }}>
        {focusCards.map(({ key, ...card }) => (
          <MetricCard key={key} {...card} />
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, alignItems: "flex-start", marginBottom: 16 }}>
        <div className="card" style={{ padding: "18px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15 }}>Follow-up queue</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                The next jobs to open if you want the CRM to feel proactive instead of reactive.
              </div>
            </div>
            <Link href="/jobs" style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", textDecoration: "none" }}>
              Open full worklist
            </Link>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {loading ? (
              <div className="empty-state" style={{ padding: 26 }}>Loading follow-up queue...</div>
            ) : followUpQueue.length > 0 ? (
              followUpQueue.slice(0, 7).map((item) => (
                <FollowUpCard key={item.job.id} item={item} />
              ))
            ) : (
              <div className="empty-state" style={{ padding: 26 }}>
                No urgent follow-up signals are bubbling up right now.
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card" style={{ padding: "18px 20px" }}>
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 6 }}>Today and tomorrow</div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 12 }}>
              Field touches and urgent issues that are about to become customer conversations.
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {loading ? (
                <div className="empty-state" style={{ padding: 22 }}>Loading touchpoints...</div>
              ) : (
                <>
                  {touchpoints.schedule.slice(0, 4).map((item) => (
                    <TouchpointRow key={item.id} item={item} />
                  ))}
                  {touchpoints.urgentService.slice(0, 2).map((item) => (
                    <TouchpointRow key={item.id} item={item} kind="service" />
                  ))}
                  {touchpoints.schedule.length === 0 && touchpoints.urgentService.length === 0 ? (
                    <div className="empty-state" style={{ padding: 22 }}>
                      Nothing time-sensitive is scheduled in the next two days.
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>

          <div className="card" style={{ padding: "18px 20px" }}>
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 6 }}>Rep pressure</div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 12 }}>
              Who is carrying the most active follow-up load right now.
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {loading ? (
                <div className="empty-state" style={{ padding: 22 }}>Loading rep summary...</div>
              ) : repPressure.length > 0 ? (
                repPressure.map((rep) => (
                  <div key={rep.repName} style={{ padding: "12px 14px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "var(--surface-2)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 6 }}>
                      <div style={{ fontWeight: 700 }}>{rep.repName}</div>
                      <span className={`badge ${rep.riskCount > 0 ? "badge-red" : rep.staleCount > 0 ? "badge-amber" : "badge-green"}`}>
                        {rep.riskCount > 0 ? `${rep.riskCount} risk` : rep.staleCount > 0 ? `${rep.staleCount} stale` : "Healthy"}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      {rep.activeCount} active job{rep.activeCount === 1 ? "" : "s"} | {rep.staleCount} stale | {rep.riskCount} at risk
                    </div>
                  </div>
                ))
              ) : (
                <div className="empty-state" style={{ padding: 22 }}>
                  Rep distribution will show up once jobs load.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, alignItems: "flex-start" }}>
        <div className="card" style={{ padding: "18px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15 }}>Quick find</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                Search by customer, phone, email, rep, address, or job number.
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "0 12px",
              border: "1px solid var(--border)",
              borderRadius: 12,
              background: "var(--surface-2)",
              marginBottom: 14,
            }}
          >
            <Search size={14} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Find a homeowner or job..."
              style={{ border: "none", background: "transparent", padding: "11px 0" }}
            />
            {searchTerm ? (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setSearchTerm("")}
                style={{ minHeight: 30, padding: "4px 8px" }}
              >
                Clear
              </button>
            ) : null}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {loading ? (
              <div className="empty-state" style={{ padding: 22 }}>Loading search index...</div>
            ) : searchResults.length > 0 ? (
              searchResults.map((job) => {
                const status = statusMeta(job.currentStatus);
                return (
                  <div
                    key={job.id}
                    onClick={() => { window.location.href = `/jobs/${job.jobNumber}`; }}
                    style={{ textDecoration: "none", cursor: "pointer" }}
                  >
                    <div style={{ padding: "12px 14px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "var(--surface)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 6 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                            <div style={{ fontWeight: 700 }}>{job.customerName}</div>
                            <span className="mono badge badge-slate">{job.jobNumber}</span>
                            <span className={`badge ${TONE_STYLES[status.tone]?.badge || "badge-slate"}`}>{status.label}</span>
                          </div>
                          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{jobAddress(job)}</div>
                        </div>
                        <div style={{ fontSize: 12, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                          {formatDate(getJobWorkflowDate(job))}
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 12, color: "var(--text-secondary)" }}>
                        {job.customerPhone ? <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Phone size={12} />{job.customerPhone}</span> : <span>Phone missing</span>}
                        {job.customerEmail ? <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Mail size={12} />{job.customerEmail}</span> : <span>Email missing</span>}
                        <span>Rep: {job.repName || "Unassigned"}</span>
                        {job.customerPath ? (
                          <Link
                            href={job.customerPath}
                            onClick={(event) => event.stopPropagation()}
                            style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--text-primary)", textDecoration: "none", fontWeight: 700 }}
                          >
                            <UserRoundSearch size={12} />
                            Customer record
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="empty-state" style={{ padding: 22 }}>
                No customers matched that search.
              </div>
            )}
          </div>
        </div>

        <div className="card" style={{ padding: "18px 20px" }}>
          <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 6 }}>Usefulness gains</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 12 }}>
            This home screen now pushes the CRM toward action instead of passive reporting.
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ padding: "12px 14px", borderRadius: "var(--radius-md)", background: "var(--surface-2)", border: "1px solid var(--border)" }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Follow-up first</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                Jobs are ranked by urgency so stale PTO, failed inspections, blocked projects, and unpaid milestones do not hide in the noise.
              </div>
            </div>
            <div style={{ padding: "12px 14px", borderRadius: "var(--radius-md)", background: "var(--surface-2)", border: "1px solid var(--border)" }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Contact-aware search</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                Quick find surfaces phone and email inline, which makes the tool feel more like a CRM and less like a static tracker.
              </div>
            </div>
            <div style={{ padding: "12px 14px", borderRadius: "var(--radius-md)", background: "var(--surface-2)", border: "1px solid var(--border)" }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Cross-team pressure</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                Schedule, service, rep load, and billing pressure now live together so the next move is easier to spot.
              </div>
            </div>

            <div style={{ marginTop: 8, padding: "12px 14px", borderRadius: "var(--radius-md)", background: "#fff8e8", border: "1px solid #f3d489" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4, color: "#7a520b", fontWeight: 700 }}>
                <AlertTriangle size={14} />
                Next worthwhile layer
              </div>
              <div style={{ fontSize: 12, color: "#926718", lineHeight: 1.6 }}>
                If we keep going, the biggest jump would be adding structured tasks, last-contact dates, and communication logging directly on the job detail page.
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
