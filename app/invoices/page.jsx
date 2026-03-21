"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { statusBadgeClass, formatCurrency, formatDate } from "@/lib/utils";
import Link from "next/link";
import { Search, AlertCircle, Lock } from "lucide-react";
import { useUserRole } from "@/lib/useUserRole";

const STATUSES = ["All", "Paid", "Pending", "Overdue"];
const TYPES = ["All", "M1", "M2"];

export default function InvoicesPage() {
  const router = useRouter();
  const { loading: roleLoading, isOwner } = useUserRole();
  const [invoices, setInvoices] = useState([]);
  const [loadingInvoices, setLoadingInvoices] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [typeFilter, setTypeFilter] = useState("All");

  useEffect(() => {
    if (!isOwner) return;
    setLoadingInvoices(true);
    fetch("/api/v2/invoices")
      .then(r => r.ok ? r.json() : [])
      .then(data => setInvoices(Array.isArray(data) ? data : []))
      .catch(() => setInvoices([]))
      .finally(() => setLoadingInvoices(false));
  }, [isOwner]);

  // Must be before any early returns — hooks must always run in the same order
  const filtered = useMemo(() => {
    return invoices.filter(inv => {
      const text = [inv.customerName, inv.invoiceNumber, inv.jobNumber, inv.financer].join(" ").toLowerCase();
      const matchSearch = text.includes(search.toLowerCase());
      const matchStatus = statusFilter === "All" || inv.status === statusFilter;
      const matchType = typeFilter === "All" || inv.invoiceType === typeFilter;
      return matchSearch && matchStatus && matchType;
    });
  }, [invoices, search, statusFilter, typeFilter]);

  // Redirect non-owners
  useEffect(() => {
    if (!roleLoading && !isOwner) router.replace("/");
  }, [roleLoading, isOwner, router]);

  if (roleLoading) {
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
          <div style={{ fontSize: 13 }}>Invoice data is only visible to owners.</div>
        </div>
      </AppShell>
    );
  }

  const paid = invoices.filter(i => i.status === "Paid").reduce((s, i) => s + i.totalCents, 0) / 100;
  const pending = invoices.filter(i => i.status === "Pending").reduce((s, i) => s + i.balanceCents, 0) / 100;
  const overdue = invoices.filter(i => i.status === "Overdue").reduce((s, i) => s + i.balanceCents, 0) / 100;
  const overdueItems = invoices.filter(i => i.status === "Overdue");

  return (
    <AppShell>
      <div className="page-header">
        <h1>Invoices</h1>
        <p>Track M1, M2 milestones, aging balances, and payment status.</p>
      </div>

      {/* Overdue alert */}
      {overdueItems.length > 0 && (
        <div style={{
          background: "var(--red-bg)",
          border: "1px solid #fca5a5",
          borderRadius: "var(--radius-lg)",
          padding: "12px 16px",
          marginBottom: 16,
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
        }}>
          <AlertCircle size={15} style={{ color: "var(--red)", flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, color: "var(--red-text)" }}>
              {overdueItems.length} overdue invoice{overdueItems.length > 1 ? "s" : ""} — {formatCurrency(overdue)} outstanding
            </div>
            <div style={{ fontSize: 12, color: "var(--red)", marginTop: 3 }}>
              {overdueItems.map(i => `${i.invoiceNumber} (${i.customerName} · ${i.invoiceType})`).join(", ")}
            </div>
          </div>
        </div>
      )}

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Collected</div>
          <div className="stat-value" style={{ color: "var(--green)" }}>{formatCurrency(paid)}</div>
          <div className="stat-detail">{invoices.filter(i => i.status === "Paid").length} invoices paid</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pending</div>
          <div className="stat-value" style={{ color: "var(--amber)" }}>{formatCurrency(pending)}</div>
          <div className="stat-detail">{invoices.filter(i => i.status === "Pending").length} awaiting payment</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Overdue</div>
          <div className="stat-value" style={{ color: "var(--red)" }}>{formatCurrency(overdue)}</div>
          <div className="stat-detail">{overdueItems.length} past due</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total invoiced</div>
          <div className="stat-value">{formatCurrency(invoices.reduce((s, i) => s + i.totalCents, 0) / 100)}</div>
          <div className="stat-detail">{invoices.length} invoices total</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: "1 1 220px", maxWidth: 340 }}>
          <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-tertiary)" }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search customer, invoice ID..."
            style={{ width: "100%", paddingLeft: 30 }}
          />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          {STATUSES.map(s => <option key={s} value={s}>{s === "All" ? "All statuses" : s}</option>)}
        </select>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          {TYPES.map(t => <option key={t} value={t}>{t === "All" ? "All milestones" : t}</option>)}
        </select>
        {(search || statusFilter !== "All" || typeFilter !== "All") && (
          <button className="btn btn-ghost" onClick={() => { setSearch(""); setStatusFilter("All"); setTypeFilter("All"); }}>
            Clear
          </button>
        )}
        <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-tertiary)" }}>
          {loadingInvoices ? "Loading..." : `${filtered.length} invoice${filtered.length !== 1 ? "s" : ""}`}
        </span>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Invoice ID</th>
                <th>Customer</th>
                <th>Job ID</th>
                <th>Milestone</th>
                <th>Financer</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Due date</th>
                <th>Paid date</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {!loadingInvoices && filtered.length === 0 && (
                <tr><td colSpan={10} className="empty-state">No invoices match your filters.</td></tr>
              )}
              {loadingInvoices && (
                <tr><td colSpan={10} className="empty-state">Loading invoices...</td></tr>
              )}
              {filtered.map(inv => (
                <tr key={inv.id} style={inv.status === "Overdue" ? { background: "#fff5f5" } : {}}>
                  <td><span className="mono badge badge-slate">{inv.invoiceNumber}</span></td>
                  <td style={{ fontWeight: 500 }}>
                    <Link href={`/jobs/${inv.jobNumber}`} onClick={e => e.stopPropagation()} style={{ color: "inherit", textDecoration: "none" }}>
                      {inv.customerName}
                    </Link>
                  </td>
                  <td>
                    <Link href={`/jobs/${inv.jobNumber}`} onClick={e => e.stopPropagation()} style={{ textDecoration: "none" }}>
                      <span className="mono badge badge-slate">{inv.jobNumber}</span>
                    </Link>
                  </td>
                  <td>
                    <span style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      fontWeight: 600,
                      background: "var(--surface-2)",
                      padding: "2px 7px",
                      borderRadius: 4,
                    }}>{inv.invoiceType}</span>
                  </td>
                  <td style={{ color: "var(--text-secondary)", fontSize: 12 }}>{inv.financer}</td>
                  <td style={{ fontWeight: 600 }}>{formatCurrency(inv.totalCents / 100)}</td>
                  <td><span className={`badge ${statusBadgeClass(inv.status)}`}>{inv.status}</span></td>
                  <td style={{ color: "var(--text-secondary)", fontSize: 12 }}>{formatDate(inv.dueAt)}</td>
                  <td style={{ color: "var(--text-secondary)", fontSize: 12 }}>{inv.status === "Paid" ? formatDate(inv.updatedAt) : "—"}</td>
                  <td style={{ color: "var(--text-secondary)", fontSize: 12, maxWidth: 200 }}>{inv.memo || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
