const DAY_MS = 86_400_000;

/** Parse "YYYY-MM-DD" as a local calendar day. `new Date("2026-11-18")` would be UTC midnight and
 * show up as the previous day in Mexico. */
export function parseDay(day: string): Date {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  return new Date(year, month - 1, date);
}

export function toDayString(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function daysSince(day: string, now: Date = new Date()): number {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today.getTime() - parseDay(day).getTime()) / DAY_MS);
}

export function formatAge(day: string, now: Date = new Date()): string {
  const days = daysSince(day, now);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  return parseDay(day).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatPercent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

export function formatWeek(day: string): string {
  return parseDay(day).toLocaleDateString("en", { month: "short", day: "numeric" });
}
