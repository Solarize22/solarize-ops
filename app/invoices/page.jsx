"use client";

import { useState, useMemo } from "react";
import AppShell from "@/components/AppShell";
import { invoices } from "@/lib/data";
import { statusBadgeClass, formatCurrency, formatDate } from "@/lib/utils";
import { Search, AlertCircle } from "lucide-react";

const STATUSES = ["All", "Paid", "Pending", "Overdue"];
const TYPES = ["All", "M1", "M2"];

export default function InvoicesPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [typeFilter, setTypeFilter] = useState("All");

  const filtered = useMemo(() => {
    return invoices.filter(inv => {
      const text = [inv.customer, inv.id, inv.jobId, inv.financer].join(" ").toLowerCase();
      const matchSearch = text.includes(search.toLowerCase());
      const matchStatus = statusFilter === "All" || inv.status === statusFilter;
      const matchType = typeFilter === "All" || inv.type === typeFilter;
      return matchSearch && matchStatus && matchType;
    });
  }, [search, statusFilter, typeFilter]);

  const paid = invoices.filter(i => i.status === "Paid").reduce((s, i) => s + i.amount, 0);
  const pending = invoices.filter(i => i.status === "Pending").reduce((s, i) => s + i.amount, 0);
  const overdue = invoices.filter(i => i.status === "Overdue").reduce((s, i) => s + i.amount, 0);
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
              {overdueItems.map(i => `${i.id} (${i.customer} · ${i.type})`).join(", ")}
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
          <div className="stat-value">{formatCurrency(invoices.reduce((s, i) => s + i.amount, 0))}</div>
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
          {filtered.length} invoice{filtered.length !== 1 ? "s" : ""}
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
              {filtered.length === 0 && (
                <tr><td colSpan={10} className="empty-state">No invoices match your filters.</td></tr>
              )}
              {filtered.map(inv => (
                <tr key={inv.id} style={inv.status === "Overdue" ? { background: "#fff5f5" } : {}}>
                  <td><span className="mono badge badge-slate">{inv.id}</span></td>
                  <td style={{ fontWeight: 500 }}>{inv.customer}</td>
                  <td><span className="mono badge badge-slate">{inv.jobId}</span></td>
                  <td>
                    <span style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      fontWeight: 600,
                      background: "var(--surface-2)",
                      padding: "2px 7px",
                      borderRadius: 4,
                    }}>{inv.type}</span>
                  </td>
                  <td style={{ color: "var(--text-secondary)", fontSize: 12 }}>{inv.financer}</td>
                  <td style={{ fontWeight: 600 }}>{formatCurrency(inv.amount)}</td>
                  <td><span className={`badge ${statusBadgeClass(inv.status)}`}>{inv.status}</span></td>
                  <td style={{ color: "var(--text-secondary)", fontSize: 12 }}>{formatDate(inv.dueDate)}</td>
                  <td style={{ color: "var(--text-secondary)", fontSize: 12 }}>{formatDate(inv.paidDate)}</td>
                  <td style={{ color: "var(--text-secondary)", fontSize: 12, maxWidth: 200 }}>{inv.notes || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
