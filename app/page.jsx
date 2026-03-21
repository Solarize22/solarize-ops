"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import Link from "next/link";
import { statusBadgeClass, formatCurrency, formatDate } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, ClipboardList, CalendarDays, Eye, EyeOff } from "lucide-react";
import PeriodFilter, { filterByPeriod } from "@/components/PeriodFilter";

const PIPELINE_STAGES = [
  { label: "created", display: "Created", bg: "#f1f5f9", color: "#334155" },
  { label: "scheduled", display: "Scheduled", bg: "#dbeafe", color: "#1e3a8a" },
  { label: "install_completed", display: "Install Complete", bg: "#d8f3dc", color: "#1b4332" },
  { label: "inspection_scheduled", display: "Inspection Scheduled", bg: "#dbeafe", color: "#1e3a8a" },
  { label: "inspection_passed", display: "Inspection Passed", bg: "#d8f3dc", color: "#1b4332" },
  { label: "pto_granted", display: "PTO Granted", bg: "#ede9fe", color: "#5b21b6" },
  { label: "paid_in_full", display: "Paid in Full", bg: "#1a1917", color: "#ffffff" },
  { label: "on_hold", display: "On Hold / Issue", bg: "#fee2e2", color: "#7f1d1d" },
];

export default function DashboardPage() {
  const [jobs, setJobs] = useState([]);
  const [report, setReport] = useState(null);
  const [permits, setPermits] = useState([]);
  const [serviceItems, setServiceItems] = useState([]);
  const [scheduleItems, setScheduleItems] = useState([]);
  const [period, setPeriod] = useState("All time");
  const [hidden, setHidden] = useState(false);
  const [loading, setLoading] = useState(true);

  const mask = v => hidden ? "••••" : v;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [jobsRes, reportsRes, permitsRes, serviceRes, scheduleRes] = await Promise.all([
          fetch("/api/v2/jobs"),
          fetch("/api/v2/reports"),
          fetch("/api/v2/permits"),
          fetch("/api/v2/service"),
          fetch("/api/v2/schedule"),
        ]);

        if (cancelled) return;

        setJobs(jobsRes.ok ? await jobsRes.json() : []);
        setReport(reportsRes.ok ? await reportsRes.json() : null);
        setPermits(permitsRes.ok ? await permitsRes.json() : []);
        setServiceItems(serviceRes.ok ? await serviceRes.json() : []);
        setScheduleItems(scheduleRes.ok ? await scheduleRes.json() : []);
      } catch {
        if (!cancelled) {
          setJobs([]);
          setReport(null);
          setPermits([]);
          setServiceItems([]);
          setScheduleItems([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  const periodReadyJobs = useMemo(() => {
    return filterByPeriod(
      jobs.map(j => ({ ...j, createdAt: j.installScheduledAt || j.installCompletedAt || j.currentStatusChangedAt })),
      period
    );
  }, [jobs, period]);

  const totalInvoiced = report?.overview?.total_invoiced_cents || 0;
  const totalCollected = report?.overview?.total_collected_cents || 0;
  const totalOutstanding = report?.overview?.total_outstanding_cents || 0;
  const overdueInvoices = (report?.overview?.overdue_invoice_count || 0);

  const activeJobs = periodReadyJobs.filter(j => !["paid_in_full", "cancelled"].includes(j.currentStatus)).length;
  const activeJobsAll = jobs.filter(j => !["paid_in_full", "cancelled"].includes(j.currentStatus)).length;
  const isFiltered = period !== "All time";
  const openService = serviceItems.filter(s => s.status !== "Resolved").length;
  const pendingPermits = permits.filter(p => p.status !== "Approved").length;
  const upcomingSchedule = scheduleItems.filter(s => s.status !== "Cancelled").slice(0, 3);
  const issueJobs = periodReadyJobs.filter(j => ["on_hold", "inspection_failed"].includes(j.currentStatus));
  const highServiceItems = serviceItems.filter(s => s.urgency === "High" && s.status !== "Resolved");

  const stageCounts = {};
  PIPELINE_STAGES.forEach(({ label }) => {
    stageCounts[label] = periodReadyJobs.filter(j => j.currentStatus === label).length;
  });

  const activeJobList = periodReadyJobs.filter(j => !["paid_in_full", "cancelled"].includes(j.currentStatus));

  return (
    <AppShell>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1>Operations dashboard</h1>
          <p>Normalized overview of jobs, billing, schedule, and issues.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <PeriodFilter value={period} onChange={setPeriod} />
          <button
            onClick={() => setHidden(h => !h)}
            title={hidden ? "Show numbers" : "Hide numbers"}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 32, height: 32, borderRadius: "50%",
              border: "1px solid var(--border-strong)",
              background: hidden ? "var(--text-primary)" : "transparent",
              color: hidden ? "#fff" : "var(--text-secondary)",
              cursor: "pointer", flexShrink: 0,
            }}
          >
            {hidden ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Total invoiced</div>
          <div className="stat-value">{mask(formatCurrency(totalInvoiced / 100))}</div>
          {isFiltered
            ? <div className="stat-detail" style={{ color: "var(--text-tertiary)" }}>{mask(formatCurrency(totalInvoiced / 100))} selected window</div>
            : <div className="stat-detail">{jobs.length} normalized jobs</div>}
        </div>
        <div className="stat-card">
          <div className="stat-label">Collected</div>
          <div className="stat-value">{mask(formatCurrency(totalCollected / 100))}</div>
          {isFiltered
            ? <div className="stat-detail" style={{ color: "var(--text-tertiary)" }}>{mask(activeJobs)} active in period</div>
            : <div className="stat-detail">{mask(activeJobsAll)} active jobs</div>}
        </div>
        <div className="stat-card">
          <div className="stat-label">Open service</div>
          <div className="stat-value">{openService}</div>
          <div className="stat-detail">Holds and failed inspections</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Permits pending</div>
          <div className="stat-value">{pendingPermits}</div>
          <div className="stat-detail">Needs permit / PTO action</div>
        </div>
      </div>

      <div className="card" style={{ padding: "14px 20px", marginBottom: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12, display: "flex", alignItems: "center", gap: 7 }}>
          <ClipboardList size={14} />
          Pipeline stages
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {PIPELINE_STAGES.map(({ label, display, bg, color }) => (
            <Link key={label} href="/jobs" style={{ textDecoration: "none" }}>
              <div style={{ background: bg, color, borderRadius: 20, padding: "5px 14px", fontSize: 12, fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
                {label === "on_hold" && <AlertTriangle size={10} />}
                {display}
                <span style={{ fontWeight: 700 }}>{stageCounts[label]}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: 16, alignItems: "flex-start" }}>
        <div className="card" style={{ padding: "18px 20px" }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 14, display: "flex", alignItems: "center", gap: 7 }}>
            <AlertTriangle size={14} style={{ color: "var(--amber)" }} />
            Needs attention
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {overdueInvoices > 0 && (
              <Link href="/reports" style={{ textDecoration: "none" }}>
                <div style={{ background: "var(--red-bg)", borderRadius: "var(--radius-md)", padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 13, color: "var(--red-text)" }}>Overdue invoices</div>
                    <div style={{ fontSize: 12, color: "var(--red)" }}>{overdueInvoices} invoice{overdueInvoices !== 1 ? "s" : ""} · {mask(formatCurrency(totalOutstanding / 100))} outstanding</div>
                  </div>
                  <span className="badge badge-red">Overdue</span>
                </div>
              </Link>
            )}
            {issueJobs.slice(0, 5).map(job => (
              <Link key={job.id} href={`/jobs/${job.jobNumber}`} style={{ textDecoration: "none" }}>
                <div style={{ background: "var(--red-bg)", borderRadius: "var(--radius-md)", padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 13, color: "var(--red-text)" }}>Issue job — {job.customerName}</div>
                    <div style={{ fontSize: 12, color: "var(--red)" }}>{job.jobNumber} · {job.currentStatus}</div>
                  </div>
                  <span className="badge badge-red">Issue</span>
                </div>
              </Link>
            ))}
            {highServiceItems.map(item => (
              <Link key={item.id} href="/service" style={{ textDecoration: "none" }}>
                <div style={{ background: "var(--red-bg)", borderRadius: "var(--radius-md)", padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 13, color: "var(--red-text)" }}>High urgency — {item.issue}</div>
                    <div style={{ fontSize: 12, color: "var(--red)" }}>{item.jobNumber} · {item.customer}</div>
                  </div>
                  <span className="badge badge-red">High</span>
                </div>
              </Link>
            ))}
            {overdueInvoices === 0 && issueJobs.length === 0 && highServiceItems.length === 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--green)", fontSize: 13, padding: "8px 0" }}>
                <CheckCircle2 size={15} />
                No blockers right now — normalized data looks clean.
              </div>
            )}
          </div>
        </div>

        <div className="card" style={{ padding: "18px 20px" }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 14, display: "flex", alignItems: "center", gap: 7 }}>
            <CalendarDays size={14} />
            Coming up
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {upcomingSchedule.map(item => (
              <Link key={item.id} href="/scheduling" style={{ textDecoration: "none" }}>
                <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>{item.customerName}</div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                      {formatDate(item.date)} · {item.startTime} · {(item.crewNames || []).join(", ")}
                    </div>
                  </div>
                  <span className={`badge ${statusBadgeClass(item.type)}`}>{item.type}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: "18px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontWeight: 600, fontSize: 13, display: "flex", alignItems: "center", gap: 7 }}>
            <ClipboardList size={14} />
            Active job pipeline
            <span style={{ fontWeight: 400, color: "var(--text-secondary)", fontSize: 12 }}>({activeJobList.length})</span>
          </div>
          <Link href="/jobs" style={{ fontSize: 12, color: "var(--text-secondary)", textDecoration: "none" }}>View all →</Link>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Job ID</th>
                <th>Town</th>
                <th>Status</th>
                <th>Next date</th>
                <th>Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="empty-state">Loading dashboard…</td></tr>
              ) : activeJobList.slice(0, 50).map(job => {
                const isIssue = ["on_hold", "inspection_failed"].includes(job.currentStatus);
                return (
                  <tr key={job.id} style={isIssue ? { background: "#fff8f8" } : undefined}>
                    <td style={{ fontWeight: 500 }}>
                      {isIssue && <AlertTriangle size={11} style={{ color: "#dc2626", marginRight: 4, verticalAlign: "middle" }} />}
                      {job.customerName}
                    </td>
                    <td><span className="mono badge badge-slate">{job.jobNumber}</span></td>
                    <td style={{ color: "var(--text-secondary)" }}>{job.address?.city}{job.address?.state ? `, ${job.address.state}` : ""}</td>
                    <td><span className={`badge ${statusBadgeClass(job.currentStatus)}`}>{job.currentStatus}</span></td>
                    <td style={{ color: "var(--text-secondary)" }}>{formatDate(job.installScheduledAt || job.installCompletedAt || job.ptoGrantedAt || job.currentStatusChangedAt)}</td>
                    <td style={{ fontWeight: 500 }}>{mask(formatCurrency((job.financialSummary?.outstandingCents || 0) / 100))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
