"use client";

export const PERIODS = ["All time", "This year", "This month", "This week"];

export function parseJobDate(job) {
  const raw = job.installDate || job.createdAt || "";
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

export function filterByPeriod(jobs, period) {
  if (period === "All time") return jobs;
  const now = new Date();
  return jobs.filter(job => {
    const d = parseJobDate(job);
    if (!d) return false;
    if (period === "This year")  return d.getFullYear() === now.getFullYear();
    if (period === "This month") return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    if (period === "This week") {
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      startOfWeek.setHours(0, 0, 0, 0);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 7);
      return d >= startOfWeek && d < endOfWeek;
    }
    return true;
  });
}

export default function PeriodFilter({ value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {PERIODS.map(p => (
        <button
          key={p}
          onClick={() => onChange(p)}
          style={{
            padding: "5px 14px",
            borderRadius: 20,
            border: "1px solid",
            fontSize: 12,
            fontWeight: 500,
            cursor: "pointer",
            transition: "all 0.12s",
            borderColor: value === p ? "var(--text-primary)" : "var(--border-strong)",
            background: value === p ? "var(--text-primary)" : "transparent",
            color: value === p ? "#fff" : "var(--text-secondary)",
          }}
        >
          {p}
        </button>
      ))}
    </div>
  );
}
