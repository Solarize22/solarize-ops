"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { formatCurrency, formatDate, formatDateTimeParts, statusBadgeClass } from "@/lib/utils";
import { useUserRole } from "@/lib/useUserRole";
import { ArrowLeft, CircleDollarSign, AlertCircle } from "lucide-react";

const PAYMENT_METHODS = ["ACH", "WIRE", "CHECK", "CREDIT_CARD", "FINANCER", "CASH", "OTHER"];

function MilestoneCard({ label, value, strong = false }) {
  return (
    <div
      style={{
        padding: "12px 14px",
        borderRadius: "var(--radius-md)",
        background: strong ? "var(--amber-bg)" : "var(--surface-2)",
        border: strong ? "1px solid var(--amber)" : "1px solid var(--border)",
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: "var(--text-tertiary)",
          textTransform: "uppercase",
          letterSpacing: ".05em",
          fontWeight: 700,
        }}
      >
        {label}
      </div>
      <div style={{ marginTop: 6, fontSize: 14, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function DateTimeStack({ value, align = "left" }) {
  const parts = formatDateTimeParts(value);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: align === "right" ? "flex-end" : "flex-start",
        gap: 2,
      }}
    >
      <span>{parts.date}</span>
      {parts.time ? (
        <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 }}>
          {parts.time}
        </span>
      ) : null}
    </div>
  );
}

function InfoGrid({ items }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "12px 14px" }}>
      {items.map((item) => (
        <div
          key={item.label}
          style={{
            padding: "12px 14px",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            background: "var(--surface-2)",
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "var(--text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: ".06em",
              marginBottom: 5,
            }}
          >
            {item.label}
          </div>
          <div style={{ fontSize: 13, color: "var(--text-primary)" }}>{item.value}</div>
        </div>
      ))}
    </div>
  );
}

function FormField({ label, children, span = 1, hint = "" }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6, gridColumn: span > 1 ? `span ${span}` : undefined }}>
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "var(--text-tertiary)",
          textTransform: "uppercase",
          letterSpacing: ".05em",
        }}
      >
        {label}
      </span>
      {children}
      {hint ? (
        <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{hint}</span>
      ) : null}
    </label>
  );
}

export default function InvoiceDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { loading: roleLoading, isOwner } = useUserRole();
  const [invoice, setInvoice] = useState(null);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [paymentForm, setPaymentForm] = useState({
    amount: "",
    paymentMethod: "ACH",
    receivedAt: "",
    paymentReference: "",
    notes: "",
  });

  const loadInvoice = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      // Get invoice by fetching job's invoices and finding the matching one
      const invoiceRes = await fetch(`/api/v2/invoices`);
      if (!invoiceRes.ok) throw new Error("Failed to load invoices");
      const allInvoices = await invoiceRes.json();
      const found = allInvoices.find((inv) => inv.id === id);
      if (!found) throw new Error("Invoice not found");
      setInvoice(found);

      // Load payment history from payments endpoint
      // We'll need to filter payments for this invoice - for now we'll fetch and filter client-side
      // In a production app, this would be a dedicated endpoint
      const paymentsRes = await fetch(`/api/v2/payments`);
      if (paymentsRes.ok) {
        const allPayments = await paymentsRes.json();
        const invoicePayments = allPayments.filter((p) => p.invoiceId === id);
        setPayments(invoicePayments);
      }
    } catch (err) {
      setError(err.message || "Failed to load invoice");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadInvoice();
  }, [loadInvoice, refreshKey]);

  useEffect(() => {
    if (!roleLoading && !isOwner) router.replace("/");
  }, [roleLoading, isOwner, router]);

  async function handlePaymentSubmit(e) {
    e.preventDefault();
    setMessage({ type: "", text: "" });

    if (!paymentForm.amount || parseFloat(paymentForm.amount) <= 0) {
      setMessage({ type: "error", text: "Please enter a valid payment amount" });
      return;
    }

    if (parseFloat(paymentForm.amount) > (invoice?.balanceCents || 0) / 100) {
      setMessage({
        type: "error",
        text: `Payment exceeds outstanding balance of ${formatCurrency((invoice?.balanceCents || 0) / 100)}`,
      });
      return;
    }

    try {
      const res = await fetch("/api/v2/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId: invoice.id,
          amount: parseFloat(paymentForm.amount),
          paymentMethod: paymentForm.paymentMethod,
          receivedAt: paymentForm.receivedAt || new Date().toISOString().slice(0, 10),
          paymentReference: paymentForm.paymentReference,
          notes: paymentForm.notes,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to record payment");
      setPaymentForm({
        amount: "",
        paymentMethod: "ACH",
        receivedAt: "",
        paymentReference: "",
        notes: "",
      });
      setMessage({ type: "success", text: "Payment recorded successfully." });
      setRefreshKey((v) => v + 1);
    } catch (err) {
      setMessage({ type: "error", text: err.message || "Failed to record payment" });
    }
  }

  if (roleLoading) {
    return (
      <AppShell>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: 300,
            color: "var(--text-tertiary)",
          }}
        >
          Loading...
        </div>
      </AppShell>
    );
  }

  if (!isOwner) {
    return (
      <AppShell>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: 300,
            gap: 12,
            color: "var(--text-tertiary)",
          }}
        >
          <AlertCircle size={32} />
          <div style={{ fontWeight: 600, color: "var(--text-secondary)" }}>Access restricted</div>
          <div style={{ fontSize: 13 }}>Invoice data is only visible to owners.</div>
        </div>
      </AppShell>
    );
  }

  if (loading) {
    return (
      <AppShell>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: 300,
            color: "var(--text-tertiary)",
          }}
        >
          Loading invoice...
        </div>
      </AppShell>
    );
  }

  if (error || !invoice) {
    return (
      <AppShell>
        <div style={{ marginBottom: 20 }}>
          <button
            onClick={() => router.back()}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-secondary)",
              padding: 0,
              fontSize: 14,
            }}
          >
            <ArrowLeft size={16} /> Back
          </button>
        </div>
        <div
          style={{
            padding: "20px",
            background: "var(--red-bg)",
            border: "1px solid var(--red)",
            borderRadius: "var(--radius-lg)",
            color: "var(--red-text)",
          }}
        >
          {error || "Invoice not found"}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div style={{ marginBottom: 20 }}>
        <button
          onClick={() => router.back()}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--text-secondary)",
            padding: 0,
            fontSize: 14,
          }}
        >
          <ArrowLeft size={16} /> Back
        </button>
      </div>

      <div className="page-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <h1 style={{ margin: 0 }}>{invoice.invoiceNumber}</h1>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              fontWeight: 600,
              background: "var(--surface-2)",
              padding: "2px 7px",
              borderRadius: 4,
            }}
          >
            {invoice.invoiceType}
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
          <div>
            <p style={{ margin: 0 }}>
              {invoice.customerName} •{" "}
              <Link href={`/jobs/${invoice.jobNumber}`} style={{ color: "var(--text-link)" }}>
                Job {invoice.jobNumber}
              </Link>
            </p>
          </div>
          <span className={`badge ${statusBadgeClass(invoice.status)}`}>{invoice.status}</span>
        </div>
      </div>

      {message.text && (
        <div
          style={{
            padding: "12px 16px",
            marginBottom: 16,
            borderRadius: "var(--radius-lg)",
            background:
              message.type === "success" ? "var(--green-bg)" : message.type === "error" ? "var(--red-bg)" : "var(--surface-2)",
            border:
              message.type === "success"
                ? "1px solid var(--green)"
                : message.type === "error"
                  ? "1px solid var(--red)"
                  : "1px solid var(--border)",
            color:
              message.type === "success"
                ? "var(--green-text)"
                : message.type === "error"
                  ? "var(--red-text)"
                  : "var(--text-secondary)",
            fontSize: 13,
          }}
        >
          {message.text}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20, marginBottom: 20 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Summary Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
            <MilestoneCard label="Total amount" value={formatCurrency(invoice.totalCents / 100)} />
            <MilestoneCard
              label="Outstanding balance"
              value={formatCurrency(invoice.balanceCents / 100)}
              strong={invoice.balanceCents > 0}
            />
          </div>

          {/* Invoice Details */}
          <div className="card card-elevated">
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <CircleDollarSign size={15} style={{ color: "var(--amber)" }} />
              <div style={{ fontWeight: 800, fontSize: 14 }}>Invoice details</div>
            </div>
            <InfoGrid
              items={[
                {
                  label: "Invoice number",
                  value: invoice.invoiceNumber,
                },
                {
                  label: "Invoice type",
                  value: invoice.invoiceType,
                },
                {
                  label: "Issued date",
                  value: formatDate(invoice.issuedAt) || "-",
                },
                {
                  label: "Due date",
                  value: formatDate(invoice.dueAt) || "-",
                },
                {
                  label: "Sent date",
                  value: formatDate(invoice.sentAt) || "-",
                },
                {
                  label: "Financer",
                  value: invoice.financer || "-",
                },
              ]}
            />
            {invoice.memo && (
              <div style={{ marginTop: 14, padding: "12px 14px", background: "var(--surface-2)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: "var(--text-tertiary)",
                    textTransform: "uppercase",
                    letterSpacing: ".06em",
                    marginBottom: 5,
                  }}
                >
                  Memo
                </div>
                <div style={{ fontSize: 13, color: "var(--text-primary)" }}>{invoice.memo}</div>
              </div>
            )}
          </div>

          {/* Line Items */}
          {invoice.lineItems && invoice.lineItems.length > 0 && (
            <div className="card card-elevated">
              <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 14 }}>Line items</div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Description</th>
                      <th>Type</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.lineItems.map((item) => (
                      <tr key={item.id}>
                        <td>{item.description}</td>
                        <td style={{ fontSize: 12, color: "var(--text-secondary)" }}>{item.lineType}</td>
                        <td style={{ fontWeight: 600 }}>{formatCurrency(item.amountCents / 100)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Payment History */}
          {payments.length > 0 && (
            <div className="card card-elevated">
              <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 14 }}>Payment history</div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date received</th>
                      <th>Amount</th>
                      <th>Method</th>
                      <th>Reference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((payment) => (
                      <tr key={payment.id}>
                        <td>{formatDate(payment.receivedAt)}</td>
                        <td style={{ fontWeight: 600 }}>{formatCurrency(payment.amountCents / 100)}</td>
                        <td style={{ fontSize: 12, color: "var(--text-secondary)" }}>{payment.paymentMethod}</td>
                        <td style={{ fontSize: 12, color: "var(--text-secondary)" }}>{payment.paymentReference || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Record Payment Sidebar */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {invoice.balanceCents > 0 && (
            <div className="card card-elevated">
              <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 14 }}>Record payment</div>
              <form onSubmit={handlePaymentSubmit} style={{ display: "grid", gap: 10 }}>
                <FormField label="Amount">
                  <input
                    type="number"
                    step="0.01"
                    value={paymentForm.amount}
                    onChange={(e) => setPaymentForm((prev) => ({ ...prev, amount: e.target.value }))}
                    placeholder={`Max: ${formatCurrency((invoice.balanceCents || 0) / 100)}`}
                  />
                </FormField>
                <FormField label="Payment method">
                  <select
                    value={paymentForm.paymentMethod}
                    onChange={(e) => setPaymentForm((prev) => ({ ...prev, paymentMethod: e.target.value }))}
                  >
                    {PAYMENT_METHODS.map((method) => (
                      <option key={method} value={method}>
                        {method}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Date received">
                  <input
                    type="date"
                    value={paymentForm.receivedAt}
                    onChange={(e) => setPaymentForm((prev) => ({ ...prev, receivedAt: e.target.value }))}
                  />
                </FormField>
                <FormField label="Reference">
                  <input
                    value={paymentForm.paymentReference}
                    onChange={(e) => setPaymentForm((prev) => ({ ...prev, paymentReference: e.target.value }))}
                    placeholder="Check number, wire reference, etc."
                  />
                </FormField>
                <FormField label="Notes">
                  <textarea
                    value={paymentForm.notes}
                    onChange={(e) => setPaymentForm((prev) => ({ ...prev, notes: e.target.value }))}
                    placeholder="Additional notes"
                    style={{ minHeight: 60, fontFamily: "var(--font-mono)", fontSize: 13 }}
                  />
                </FormField>
                <button className="btn btn-primary" type="submit" style={{ marginTop: 4 }}>
                  Record payment
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
