"use client";

export const PERIODS = ["Today", "This week", "Next week", "This month", "All"];

export function parseJobDate(job) {
  const raw = job.installDate || job.createdAt || "";
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

export function filterByPeriod(jobs, period) {
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(startOfToday.getDate() + 1);
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfToday.getDate() - startOfToday.getDay());
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);
  const nextWeekStart = new Date(endOfWeek);
  const nextWeekEnd = new Date(nextWeekStart);
  nextWeekEnd.setDate(nextWeekStart.getDate() + 7);

  return jobs.filter(job => {
    const d = parseJobDate(job);
    if (!d) return false;
    if (period === "All") return true;
    if (period === "Today") return d >= startOfToday && d < endOfToday;
    if (period === "This week") return d >= startOfWeek && d < endOfWeek;
    if (period === "Next week") return d >= nextWeekStart && d < nextWeekEnd;
    if (period === "This month") return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    return true;
  });
}

export default function PeriodFilter({ value, onChange }) {
  return (
    <div className="segmented-control">
      {PERIODS.map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={`segmented-button ${value === p ? "active" : ""}`}
        >
          {p}
        </button>
      ))}
    </div>
  );
}
