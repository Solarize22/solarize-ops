"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { formatCurrency } from "@/lib/utils";
import { useUserRole } from "@/lib/useUserRole";
import { Lock } from "lucide-react";
import { useRouter } from "next/navigation";

function ProgressRow({ label, value, max, color = "var(--text-primary)" }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 5 }}>
        <span style={{ color: "var(--text-secondary)" }}>{label}</span>
        <span style={{ fontWeight: 600 }}>{value} <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>/ {max}</span></span>
      </div>
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function MetricBlock({ label, value, sub, color }) {
  return (
    <div style={{ background: "var(--surface-2)", borderRadius: "var(--radius-md)", padding: "14px 16px" }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", color: color || "var(--text-primary)" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

export default function ReportsPage() {
  const router = useRouter();
  const { loading: roleLoading, isOwner } = useUserRole();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!roleLoading && !isOwner) router.replace("/");
  }, [roleLoading, isOwner, router]);

  useEffect(() => {
    if (!isOwner) return;
    setLoading(true);
    fetch("/api/v2/reports")
      .then(r => r.ok ? r.json() : null)
      .then(data => setReport(data))
      .catch(() => setReport(null))
      .finally(() => setLoading(false));
  }, [isOwner]);

  const overview = report?.overview;
  const totalJobs = overview?.job_count || 0;
  const jobsByStatus = useMemo(() => report?.jobsByStatus || [], [report]);
  const invoicesByStatus = useMemo(() => report?.invoicesByStatus || [], [report]);
  const invoicesByType = useMemo(() => report?.invoicesByType || [], [report]);
  const topReps = useMemo(() => report?.topReps || [], [report]);

  if (roleLoading || loading) {
    return (
      <AppShell>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300, color: "var(--text-tertiary)" }}>
          Loading…
        </div>
      </AppShell>
    );
  }

  if (!isOwner) {
    return (
      <AppShell>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 300, gap: 12, color: "var(--text-tertiary)" }}>
          <Lock size={32} />
          <div style={{ fontWeight: 600, color: "var(--text-secondary)" }}>Access restricted</div>
          <div style={{ fontSize: 13 }}>Reports are only visible to owners.</div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="page-header">
        <h1>Reports</h1>
        <p>Normalized financial and pipeline reporting backed by Neon.</p>
      </div>

      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-label">Total invoiced</div>
          <div className="stat-value">{formatCurrency((overview?.total_invoiced_cents || 0) / 100)}</div>
          <div className="stat-detail">{overview?.job_count || 0} jobs tracked</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Collected</div>
          <div className="stat-value" style={{ color: "var(--green)" }}>{formatCurrency((overview?.total_collected_cents || 0) / 100)}</div>
          <div className="stat-detail">Applied against issued invoices</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Outstanding</div>
          <div className="stat-value" style={{ color: "var(--amber)" }}>{formatCurrency((overview?.total_outstanding_cents || 0) / 100)}</div>
          <div className="stat-detail">Open invoice balance</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Overdue</div>
          <div className="stat-value" style={{ color: (overview?.overdue_outstanding_cents || 0) > 0 ? "var(--red)" : "var(--green)" }}>
            {formatCurrency((overview?.overdue_outstanding_cents || 0) / 100)}
          </div>
          <div className="stat-detail">{overview?.overdue_invoice_count || 0} invoices past due</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div className="card" style={{ padding: "18px 20px" }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 16 }}>Pipeline health</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <MetricBlock label="Jobs" value={totalJobs} sub="Normalized records" />
            <MetricBlock
              label="Collection %"
              value={`${overview?.total_invoiced_cents ? Math.round(((overview.total_collected_cents || 0) / overview.total_invoiced_cents) * 100) : 0}%`}
              sub="Collected / invoiced"
            />
            <MetricBlock label="Open balance" value={formatCurrency((overview?.total_outstanding_cents || 0) / 100)} sub="Across all invoices" color="var(--amber)" />
            <MetricBlock label="Overdue count" value={overview?.overdue_invoice_count || 0} sub="Needs collection follow-up" color={(overview?.overdue_invoice_count || 0) > 0 ? "var(--red)" : "var(--green)"} />
          </div>
        </div>

        <div className="card" style={{ padding: "18px 20px" }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 16 }}>Jobs by status</div>
          {jobsByStatus.map((row) => (
            <ProgressRow key={row.status} label={row.status} value={row.count} max={totalJobs} />
          ))}
        </div>

        <div className="card" style={{ padding: "18px 20px" }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 16 }}>Invoices by type</div>
          {invoicesByType.map((row) => (
            <ProgressRow
              key={row.type}
              label={`${row.type.toUpperCase()} · ${formatCurrency((row.total_cents || 0) / 100)}`}
              value={row.count}
              max={Math.max(invoicesByType.reduce((sum, item) => sum + item.count, 0), 1)}
            />
          ))}
          <div style={{ marginTop: 20 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>Top reps by invoiced value</div>
            {topReps.map((rep) => (
              <div key={rep.rep_name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{rep.rep_name}</span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{formatCurrency((rep.total_invoiced_cents || 0) / 100)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: "18px 20px" }}>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 14 }}>Invoice status summary</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          {invoicesByStatus.map((row) => (
            <div
              key={row.status}
              style={{
                background: "var(--surface-2)",
                borderRadius: "var(--radius-md)",
                padding: "14px 16px",
                borderLeft: `3px solid ${row.status === "paid" ? "var(--green)" : row.status === "partially_paid" ? "var(--amber)" : row.status === "void" ? "#6b7280" : "var(--text-primary)"}`,
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-tertiary)", marginBottom: 6 }}>
                {row.status}
              </div>
              <div style={{ fontSize: 20, fontWeight: 600 }}>{formatCurrency((row.total_cents || 0) / 100)}</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 3 }}>
                {row.count} invoices · {formatCurrency((row.balance_cents || 0) / 100)} open
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
