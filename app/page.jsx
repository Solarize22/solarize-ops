"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Eye,
  EyeOff,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import PeriodFilter, { filterByPeriod } from "@/components/PeriodFilter";
import { statusBadgeClass, formatCurrency, formatDate } from "@/lib/utils";
import { useUserRole } from "@/lib/useUserRole";

const PIPELINE_STAGES = [
  { label: "created", display: "Created", badge: "badge-slate" },
  { label: "scheduled", display: "Scheduled", badge: "badge-blue" },
  { label: "install_completed", display: "Install Complete", badge: "badge-green" },
  { label: "inspection_scheduled", display: "Inspection Scheduled", badge: "badge-blue" },
  { label: "inspection_passed", display: "Inspection Passed", badge: "badge-green" },
  { label: "pto_granted", display: "PTO Granted", badge: "badge-blue" },
  { label: "paid_in_full", display: "Paid in Full", badge: "badge-dark" },
  { label: "on_hold", display: "On Hold / Issue", badge: "badge-red" },
];

export default function DashboardPage() {
  const { canSeeFinancials } = useUserRole();
  const [jobs, setJobs] = useState([]);
  const [report, setReport] = useState(null);
  const [permits, setPermits] = useState([]);
  const [serviceItems, setServiceItems] = useState([]);
  const [scheduleItems, setScheduleItems] = useState([]);
  const [period, setPeriod] = useState("This week");
  const [hidden, setHidden] = useState(false);
  const [loading, setLoading] = useState(true);

  const mask = (value) => (hidden ? "...." : value);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const requests = [
          fetch("/api/v2/jobs"),
          fetch("/api/v2/permits"),
          fetch("/api/v2/service"),
          fetch("/api/v2/schedule"),
        ];
        if (canSeeFinancials) {
          requests.splice(1, 0, fetch("/api/v2/reports"));
        }

        const responses = await Promise.all(requests);
        const [jobsRes, maybeReportsRes, permitsRes, serviceRes, scheduleRes] = canSeeFinancials
          ? responses
          : [responses[0], null, responses[1], responses[2], responses[3]];

        if (cancelled) return;

        setJobs(jobsRes.ok ? await jobsRes.json() : []);
        setReport(canSeeFinancials && maybeReportsRes?.ok ? await maybeReportsRes.json() : null);
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
    return () => {
      cancelled = true;
    };
  }, [canSeeFinancials]);

  const periodReadyJobs = useMemo(() => {
    return filterByPeriod(
      jobs.map((job) => ({
        ...job,
        createdAt: job.installScheduledAt || job.installCompletedAt || job.currentStatusChangedAt,
      })),
      period
    );
  }, [jobs, period]);

  const totalInvoiced = report?.overview?.total_invoiced_cents || 0;
  const totalCollected = report?.overview?.total_collected_cents || 0;
  const totalOutstanding = report?.overview?.total_outstanding_cents || 0;
  const overdueInvoices = report?.overview?.overdue_invoice_count || 0;

  const activeJobs = periodReadyJobs.filter((job) => !["paid_in_full", "cancelled"].includes(job.currentStatus)).length;
  const scheduledJobs = periodReadyJobs.filter((job) => job.currentStatus === "scheduled").length;
  const openService = serviceItems.filter((item) => item.status !== "Resolved").length;
  const pendingPermits = permits.filter((item) => item.status !== "Approved").length;
  const upcomingSchedule = scheduleItems.filter((item) => item.status !== "Cancelled").slice(0, 3);
  const issueJobs = periodReadyJobs.filter((job) => ["on_hold", "inspection_failed"].includes(job.currentStatus));
  const highServiceItems = serviceItems.filter((item) => item.urgency === "High" && item.status !== "Resolved");

  const stageCounts = {};
  PIPELINE_STAGES.forEach(({ label }) => {
    stageCounts[label] = periodReadyJobs.filter((job) => job.currentStatus === label).length;
  });

  const activeJobList = periodReadyJobs.filter((job) => !["paid_in_full", "cancelled"].includes(job.currentStatus));

  return (
    <AppShell>
      <div
        className="page-header"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}
      >
        <div>
          <h1>Operations dashboard</h1>
          <p>Normalized overview of jobs, billing, schedule, and issues.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <PeriodFilter value={period} onChange={setPeriod} />
          <button
            onClick={() => setHidden((value) => !value)}
            title={hidden ? "Show numbers" : "Hide numbers"}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 32,
              height: 32,
              borderRadius: "50%",
              border: "1px solid var(--border-strong)",
              background: hidden ? "var(--text-primary)" : "transparent",
              color: hidden ? "var(--accent-text)" : "var(--text-secondary)",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            {hidden ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>

      <div className="stat-grid">
        {canSeeFinancials ? (
          <>
            <div className="stat-card">
              <div className="stat-label">Total invoiced</div>
              <div className="stat-value">{mask(formatCurrency(totalInvoiced / 100))}</div>
              <div className="stat-detail" style={{ color: "var(--text-tertiary)" }}>
                {mask(formatCurrency(totalInvoiced / 100))} selected window
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Collected</div>
              <div className="stat-value">{mask(formatCurrency(totalCollected / 100))}</div>
              <div className="stat-detail" style={{ color: "var(--text-tertiary)" }}>
                {mask(activeJobs)} active in period
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="stat-card">
              <div className="stat-label">Active jobs</div>
              <div className="stat-value">{activeJobs}</div>
              <div className="stat-detail">Operational jobs in the selected window</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Scheduled installs</div>
              <div className="stat-value">{scheduledJobs}</div>
              <div className="stat-detail">Crew-ready installs in the selected window</div>
            </div>
          </>
        )}
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
          {PIPELINE_STAGES.map(({ label, display, badge }) => (
            <Link key={label} href="/jobs" style={{ textDecoration: "none" }}>
              <div
                className={`badge ${badge}`}
                style={{ padding: "5px 14px", display: "flex", alignItems: "center", gap: 6 }}
              >
                {label === "on_hold" && <AlertTriangle size={10} />}
                {display}
                <span style={{ fontWeight: 700 }}>{stageCounts[label]}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16, alignItems: "flex-start" }}>
        <div className="card" style={{ padding: "18px 20px" }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 14, display: "flex", alignItems: "center", gap: 7 }}>
            <AlertTriangle size={14} style={{ color: "var(--amber)" }} />
            Needs attention
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {canSeeFinancials && overdueInvoices > 0 && (
              <Link href="/reports" style={{ textDecoration: "none" }}>
                <div style={{ background: "var(--red-bg)", borderRadius: "var(--radius-md)", padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 13, color: "var(--red-text)" }}>Overdue invoices</div>
                    <div style={{ fontSize: 12, color: "var(--red)" }}>
                      {overdueInvoices} invoice{overdueInvoices !== 1 ? "s" : ""} - {mask(formatCurrency(totalOutstanding / 100))} outstanding
                    </div>
                  </div>
                  <span className="badge badge-red">Overdue</span>
                </div>
              </Link>
            )}
            {issueJobs.slice(0, 5).map((job) => (
              <Link key={job.id} href={`/jobs/${job.jobNumber}`} style={{ textDecoration: "none" }}>
                <div style={{ background: "var(--red-bg)", borderRadius: "var(--radius-md)", padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 13, color: "var(--red-text)" }}>Issue job - {job.customerName}</div>
                    <div style={{ fontSize: 12, color: "var(--red)" }}>{job.jobNumber} - {job.currentStatus}</div>
                  </div>
                  <span className="badge badge-red">Issue</span>
                </div>
              </Link>
            ))}
            {highServiceItems.map((item) => (
              <Link key={item.id} href="/service" style={{ textDecoration: "none" }}>
                <div style={{ background: "var(--red-bg)", borderRadius: "var(--radius-md)", padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 13, color: "var(--red-text)" }}>High urgency - {item.issue}</div>
                    <div style={{ fontSize: 12, color: "var(--red)" }}>{item.jobNumber} - {item.customer}</div>
                  </div>
                  <span className="badge badge-red">High</span>
                </div>
              </Link>
            ))}
            {(!canSeeFinancials || overdueInvoices === 0) && issueJobs.length === 0 && highServiceItems.length === 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--green)", fontSize: 13, padding: "8px 0" }}>
                <CheckCircle2 size={15} />
                No blockers right now - normalized data looks clean.
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
            {upcomingSchedule.map((item) => (
              <Link key={item.id} href="/scheduling" style={{ textDecoration: "none" }}>
                <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>{item.customerName}</div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                      {formatDate(item.date)} - {item.startTime} - {(item.crewNames || []).join(", ")}
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
          <Link href="/jobs" style={{ fontSize: 12, color: "var(--text-secondary)", textDecoration: "none" }}>View all -&gt;</Link>
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
                {canSeeFinancials ? <th>Outstanding</th> : null}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={canSeeFinancials ? 6 : 5} className="empty-state">Loading dashboard...</td>
                </tr>
              ) : activeJobList.slice(0, 50).map((job) => {
                const isIssue = ["on_hold", "inspection_failed"].includes(job.currentStatus);
                return (
                  <tr key={job.id} style={isIssue ? { background: "var(--red-bg)" } : undefined}>
                    <td style={{ fontWeight: 500 }}>
                      {isIssue && <AlertTriangle size={11} style={{ color: "var(--red)", marginRight: 4, verticalAlign: "middle" }} />}
                      {job.customerName}
                    </td>
                    <td><span className="mono badge badge-slate">{job.jobNumber}</span></td>
                    <td style={{ color: "var(--text-secondary)" }}>{job.address?.city}{job.address?.state ? `, ${job.address.state}` : ""}</td>
                    <td><span className={`badge ${statusBadgeClass(job.currentStatus)}`}>{job.currentStatus}</span></td>
                    <td style={{ color: "var(--text-secondary)" }}>{formatDate(job.installScheduledAt || job.installCompletedAt || job.ptoGrantedAt || job.currentStatusChangedAt)}</td>
                  {canSeeFinancials ? <td style={{ fontWeight: 500 }}>{mask(formatCurrency((job.financialSummary?.outstandingCents || 0) / 100))}</td> : null}
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
