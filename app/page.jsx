"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  SunMedium,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import { formatCurrency, formatDate, getJobWorkflowDate } from "@/lib/utils";
import { useUserRole } from "@/lib/useUserRole";

const STATUS_META = {
  created: { label: "Created", bg: "#f1f5f9", color: "#334155" },
  scheduled: { label: "Scheduled", bg: "#dbeafe", color: "#1d4ed8" },
  install_completed: { label: "Install complete", bg: "#dcfce7", color: "#166534" },
  inspection_scheduled: { label: "Inspection scheduled", bg: "#e0f2fe", color: "#075985" },
  inspection_passed: { label: "Inspection passed", bg: "#d1fae5", color: "#065f46" },
  inspection_failed: { label: "Inspection failed", bg: "#fee2e2", color: "#991b1b" },
  pto_submitted: { label: "PTO submitted", bg: "#fef3c7", color: "#92400e" },
  pto_granted: { label: "PTO granted", bg: "#ede9fe", color: "#6d28d9" },
  m1_paid: { label: "M1 paid", bg: "#dcfce7", color: "#166534" },
  paid_in_full: { label: "Paid in full", bg: "#111827", color: "#ffffff" },
  on_hold: { label: "On hold", bg: "#fee2e2", color: "#991b1b" },
  cancelled: { label: "Cancelled", bg: "#e5e7eb", color: "#4b5563" },
};

const CARD_TONES = {
  slate: { bg: "var(--surface)", border: "var(--border)", iconBg: "var(--surface-2)", iconColor: "var(--text-secondary)" },
  blue: { bg: "#eff6ff", border: "#bfdbfe", iconBg: "#dbeafe", iconColor: "#1d4ed8" },
  green: { bg: "#f0fdf4", border: "#bbf7d0", iconBg: "#dcfce7", iconColor: "#166534" },
  amber: { bg: "#fffbeb", border: "#fde68a", iconBg: "#fef3c7", iconColor: "#92400e" },
  red: { bg: "#fef2f2", border: "#fecaca", iconBg: "#fee2e2", iconColor: "#b91c1c" },
  violet: { bg: "#f5f3ff", border: "#ddd6fe", iconBg: "#ede9fe", iconColor: "#6d28d9" },
};

function statusMeta(status) {
  return STATUS_META[status] || STATUS_META.created;
}

function parseDateValue(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isSameDay(left, right) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

function daysSince(value) {
  const parsed = parseDateValue(value);
  if (!parsed) return null;
  const diffMs = startOfDay(new Date()).getTime() - startOfDay(parsed).getTime();
  return Math.floor(diffMs / 86400000);
}

function jobAddress(job) {
  return [job.address?.street1, job.address?.city, job.address?.state].filter(Boolean).join(", ") || "-";
}

function ActionCard({ href, title, count, detail, footnote, icon: Icon, tone = "slate" }) {
  const colors = CARD_TONES[tone] || CARD_TONES.slate;

  return (
    <Link href={href} style={{ textDecoration: "none" }}>
      <div
        className="card"
        style={{
          padding: 18,
          border: `1px solid ${colors.border}`,
          background: colors.bg,
          minHeight: 148,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          gap: 14,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--text-secondary)", marginBottom: 8 }}>
              {title}
            </div>
            <div style={{ fontSize: 34, fontWeight: 800, lineHeight: 1, color: "var(--text-primary)", marginBottom: 10 }}>
              {count}
            </div>
            <div style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 600 }}>
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
              background: colors.iconBg,
              color: colors.iconColor,
              flexShrink: 0,
            }}
          >
            <Icon size={18} />
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{footnote}</div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--text-primary)", fontSize: 12, fontWeight: 700 }}>
            Open
            <ArrowRight size={13} />
          </div>
        </div>
      </div>
    </Link>
  );
}

function JobListItem({ job, href, note, tone = "default" }) {
  const status = statusMeta(job.currentStatus);
  const isAlert = tone === "alert";

  return (
    <Link href={href} style={{ textDecoration: "none" }}>
      <div
        style={{
          padding: "12px 14px",
          borderRadius: "var(--radius-md)",
          border: `1px solid ${isAlert ? "#fecaca" : "var(--border)"}`,
          background: isAlert ? "#fef2f2" : "var(--surface)",
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "flex-start",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            {isAlert ? <AlertTriangle size={13} style={{ color: "#b91c1c", flexShrink: 0 }} /> : null}
            <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>{job.customerName}</div>
            <span className="mono badge badge-slate">{job.jobNumber}</span>
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>{jobAddress(job)}</div>
          <div style={{ fontSize: 12, color: isAlert ? "#991b1b" : "var(--text-secondary)" }}>{note}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <span style={{ padding: "4px 9px", borderRadius: 999, background: status.bg, color: status.color, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>
            {status.label}
          </span>
          <ChevronRight size={15} style={{ color: "var(--text-tertiary)" }} />
        </div>
      </div>
    </Link>
  );
}

export default function DashboardPage() {
  const { canSeeFinancials } = useUserRole();
  const [jobs, setJobs] = useState([]);
  const [report, setReport] = useState(null);
  const [serviceItems, setServiceItems] = useState([]);
  const [scheduleItems, setScheduleItems] = useState([]);
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

  const scheduledJobs = useMemo(() => {
    return activeJobs.filter((job) => job.currentStatus === "scheduled");
  }, [activeJobs]);

  const readyForM1 = useMemo(() => {
    return activeJobs.filter((job) => ["install_completed", "inspection_scheduled", "inspection_passed"].includes(job.currentStatus));
  }, [activeJobs]);

  const inspectionQueue = useMemo(() => {
    return activeJobs.filter((job) => ["inspection_scheduled", "inspection_failed"].includes(job.currentStatus));
  }, [activeJobs]);

  const ptoWatch = useMemo(() => {
    return activeJobs.filter((job) => ["inspection_passed", "pto_submitted"].includes(job.currentStatus));
  }, [activeJobs]);

  const readyForM2 = useMemo(() => {
    return activeJobs.filter((job) => ["pto_granted", "m1_paid"].includes(job.currentStatus));
  }, [activeJobs]);

  const problemJobs = useMemo(() => {
    return activeJobs.filter((job) => ["on_hold", "inspection_failed"].includes(job.currentStatus));
  }, [activeJobs]);

  const collectionsQueue = useMemo(() => {
    return activeJobs.filter((job) => (job.financialSummary?.outstandingCents || 0) > 0);
  }, [activeJobs]);

  const stalePtoJobs = useMemo(() => {
    return ptoWatch
      .filter((job) => {
        const age = daysSince(getJobWorkflowDate(job));
        return age !== null && age >= 7;
      })
      .sort((a, b) => (daysSince(getJobWorkflowDate(b)) || 0) - (daysSince(getJobWorkflowDate(a)) || 0));
  }, [ptoWatch]);

  const orderedSchedule = useMemo(() => {
    return [...scheduleItems]
      .map((item) => ({ ...item, parsedDate: parseDateValue(item.date) }))
      .filter((item) => item.parsedDate)
      .sort((a, b) => a.parsedDate.getTime() - b.parsedDate.getTime());
  }, [scheduleItems]);

  const today = startOfDay(new Date());

  const todaySchedule = useMemo(() => {
    return orderedSchedule.filter((item) => isSameDay(item.parsedDate, today)).slice(0, 5);
  }, [orderedSchedule, today]);

  const upcomingSchedule = useMemo(() => {
    return orderedSchedule
      .filter((item) => item.parsedDate >= today && !isSameDay(item.parsedDate, today))
      .slice(0, 5);
  }, [orderedSchedule, today]);

  const highUrgencyService = useMemo(() => {
    return serviceItems.filter((item) => item.urgency === "High" && item.status !== "Resolved");
  }, [serviceItems]);

  const attentionItems = useMemo(() => {
    const items = [];

    if (canSeeFinancials && (report?.overview?.overdue_invoice_count || 0) > 0) {
      items.push({
        id: "overdue-invoices",
        title: "Overdue invoices",
        subtitle: `${report.overview.overdue_invoice_count} overdue · ${formatCurrency((report.overview.overdue_outstanding_cents || 0) / 100)} still open`,
        href: "/invoices",
        tone: "red",
      });
    }

    problemJobs.slice(0, 3).forEach((job) => {
      items.push({
        id: `problem-${job.id}`,
        title: `${job.customerName} needs ops help`,
        subtitle: `${statusMeta(job.currentStatus).label} · ${job.jobNumber}`,
        href: `/jobs/${job.jobNumber}`,
        tone: "red",
      });
    });

    stalePtoJobs.slice(0, 3).forEach((job) => {
      const age = daysSince(getJobWorkflowDate(job));
      items.push({
        id: `pto-${job.id}`,
        title: `${job.customerName} is stuck in PTO`,
        subtitle: `${statusMeta(job.currentStatus).label} for ${age} day${age === 1 ? "" : "s"}`,
        href: `/jobs/${job.jobNumber}`,
        tone: "amber",
      });
    });

    highUrgencyService.slice(0, 2).forEach((item) => {
      items.push({
        id: `svc-${item.id}`,
        title: item.issue,
        subtitle: `${item.customer} · ${item.jobNumber}`,
        href: "/service",
        tone: "red",
      });
    });

    return items.slice(0, 7);
  }, [canSeeFinancials, highUrgencyService, problemJobs, report, stalePtoJobs]);

  const actionCards = [
    {
      key: "all",
      title: "All active jobs",
      count: activeJobs.length,
      detail: "Open pipeline across installs, inspection, PTO, and billing.",
      footnote: `${jobs.length} total records in the system`,
      href: "/jobs",
      icon: ClipboardList,
      tone: "slate",
    },
    {
      key: "scheduled",
      title: "Scheduled installs",
      count: scheduledJobs.length,
      detail: "Crew-ready jobs that should be moving this week.",
      footnote: `${todaySchedule.filter((item) => item.type === "Install").length} installs on today's board`,
      href: "/jobs?queue=scheduled",
      icon: CalendarDays,
      tone: "blue",
    },
    ...(canSeeFinancials ? [{
      key: "m1",
      title: "Ready for M1",
      count: readyForM1.length,
      detail: "Install done or inspection underway, billing should move quickly.",
      footnote: "Open the jobs board on the M1 queue",
      href: "/jobs?queue=m1",
      icon: CircleDollarSign,
      tone: "green",
    }] : []),
    {
      key: "inspection",
      title: "Inspection queue",
      count: inspectionQueue.length,
      detail: "Jobs that need inspection scheduling, follow-through, or fixes.",
      footnote: `${problemJobs.filter((job) => job.currentStatus === "inspection_failed").length} failed inspections`,
      href: "/jobs?queue=inspection",
      icon: ClipboardList,
      tone: "amber",
    },
    {
      key: "pto",
      title: "PTO watch",
      count: ptoWatch.length,
      detail: "Passed inspections and submitted PTO files that still need movement.",
      footnote: `${stalePtoJobs.length} sitting 7+ days`,
      href: "/jobs",
      icon: SunMedium,
      tone: "violet",
    },
    ...(canSeeFinancials ? [{
      key: "m2",
      title: "Ready for M2",
      count: readyForM2.length,
      detail: "PTO-granted jobs ready for final billing and closeout.",
      footnote: "Open the jobs board on the M2 queue",
      href: "/jobs?queue=m2",
      icon: CircleDollarSign,
      tone: "violet",
    }] : []),
    {
      key: "issues",
      title: "Problem jobs",
      count: problemJobs.length,
      detail: "On-hold jobs and failed inspections that need intervention.",
      footnote: `${highUrgencyService.length} high-urgency service items`,
      href: "/jobs?queue=issues",
      icon: AlertTriangle,
      tone: "red",
    },
    ...(canSeeFinancials ? [{
      key: "collections",
      title: "Unpaid follow-up",
      count: collectionsQueue.length,
      detail: "Jobs with outstanding balances that still need attention.",
      footnote: `${report?.overview?.overdue_invoice_count || 0} overdue invoices`,
      href: "/jobs?queue=collections",
      icon: CircleDollarSign,
      tone: "amber",
    }] : []),
  ];

  return (
    <AppShell>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 20 }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>Operations home</h1>
          <p>Start here, then jump straight into the queue that needs work right now.</p>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600, paddingTop: 6 }}>
          {loading ? "Loading live operations snapshot..." : `${activeJobs.length} active jobs in motion`}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 14, marginBottom: 20 }}>
        {actionCards.map((card) => (
          <ActionCard key={card.key} {...card} />
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)", gap: 16, marginBottom: 16, alignItems: "flex-start" }}>
        <div className="card" style={{ padding: "18px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 14 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15 }}>Today and next up</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                Installs and inspections that are actually on deck.
              </div>
            </div>
            <Link href="/scheduling" style={{ fontSize: 12, color: "var(--text-secondary)", textDecoration: "none" }}>
              Open schedule
            </Link>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {loading ? (
              <div className="empty-state" style={{ padding: 26 }}>Loading schedule...</div>
            ) : [...todaySchedule, ...upcomingSchedule].slice(0, 6).map((item) => {
              const isToday = isSameDay(item.parsedDate, today);
              return (
                <Link key={item.id} href="/scheduling" style={{ textDecoration: "none" }}>
                  <div
                    style={{
                      padding: "12px 14px",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid var(--border)",
                      background: isToday ? "var(--surface-2)" : "var(--surface)",
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      alignItems: "flex-start",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>{item.customerName}</div>
                        <span className="mono badge badge-slate">{item.jobNumber}</span>
                        {isToday ? <span className="badge badge-blue">Today</span> : null}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>{item.site}</div>
                      <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                        {formatDate(item.date)} · {item.type} · {item.startTime}
                        {item.crewNames?.length ? ` · ${item.crewNames.join(", ")}` : ""}
                      </div>
                    </div>
                    <ChevronRight size={15} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
                  </div>
                </Link>
              );
            })}

            {!loading && todaySchedule.length === 0 && upcomingSchedule.length === 0 ? (
              <div className="empty-state" style={{ padding: 26 }}>
                Nothing is scheduled right now.
              </div>
            ) : null}
          </div>
        </div>

        <div className="card" style={{ padding: "18px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 14 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15 }}>Needs attention now</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                The handful of things most likely to bite you if ignored.
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {loading ? (
              <div className="empty-state" style={{ padding: 26 }}>Loading attention items...</div>
            ) : attentionItems.length > 0 ? (
              attentionItems.map((item) => (
                <Link key={item.id} href={item.href} style={{ textDecoration: "none" }}>
                  <div
                    style={{
                      padding: "12px 14px",
                      borderRadius: "var(--radius-md)",
                      border: `1px solid ${item.tone === "red" ? "#fecaca" : "#fde68a"}`,
                      background: item.tone === "red" ? "#fef2f2" : "#fffbeb",
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      alignItems: "flex-start",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, color: item.tone === "red" ? "#991b1b" : "#92400e", marginBottom: 4 }}>
                        {item.title}
                      </div>
                      <div style={{ fontSize: 12, color: item.tone === "red" ? "#b91c1c" : "#a16207" }}>{item.subtitle}</div>
                    </div>
                    <ChevronRight size={15} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
                  </div>
                </Link>
              ))
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--green)", fontSize: 13, padding: "8px 0" }}>
                <CheckCircle2 size={15} />
                Nothing urgent is bubbling up right now.
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 16, alignItems: "flex-start" }}>
        <div className="card" style={{ padding: "18px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 14 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15 }}>Jobs to open first</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                A short list of open jobs that are already throwing off signals.
              </div>
            </div>
            <Link href="/jobs" style={{ fontSize: 12, color: "var(--text-secondary)", textDecoration: "none" }}>
              Open jobs board
            </Link>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {loading ? (
              <div className="empty-state" style={{ padding: 26 }}>Loading jobs...</div>
            ) : problemJobs.slice(0, 3).map((job) => (
              <JobListItem
                key={job.id}
                job={job}
                href={`/jobs/${job.jobNumber}`}
                tone="alert"
                note={`Workflow date ${formatDate(getJobWorkflowDate(job))}`}
              />
            ))}

            {!loading && problemJobs.length === 0 && stalePtoJobs.slice(0, 3).map((job) => (
              <JobListItem
                key={job.id}
                job={job}
                href={`/jobs/${job.jobNumber}`}
                note={`Waiting in ${statusMeta(job.currentStatus).label} since ${formatDate(getJobWorkflowDate(job))}`}
              />
            ))}

            {!loading && problemJobs.length === 0 && stalePtoJobs.length === 0 ? (
              <div className="empty-state" style={{ padding: 26 }}>
                No obvious problem jobs right now.
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
