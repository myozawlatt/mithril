const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "MMK",
  currencyDisplay: "code",
  maximumFractionDigits: 0,
});

const plain = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** "MMK 12,500" */
export function formatMoney(amount: number): string {
  return money.format(amount).replace(/ /g, " ");
}

/** "12,500" — for inputs and compact places */
export function formatNumber(amount: number): string {
  return plain.format(amount);
}

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

/** Axis ticks and tight labels: 0 / 12.5K / 1.2M */
export function formatCompact(amount: number): string {
  return compact.format(amount);
}

/** Strip anything that isn't a digit and return an integer (or 0). */
export function parseAmount(input: string): number {
  const digits = input.replace(/\D/g, "").slice(0, 12);
  return digits ? parseInt(digits, 10) : 0;
}

/** Month keys look like "2026-10". */
export type MonthKey = string;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayKey(): string {
  return toDateKey(new Date());
}

export function monthOf(dateKey: string): MonthKey {
  return dateKey.slice(0, 7);
}

export function currentMonth(): MonthKey {
  return monthOf(todayKey());
}

export function shiftMonth(month: MonthKey, delta: number): MonthKey {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function monthLabel(month: MonthKey): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

/** "Oct" */
export function monthShortLabel(month: MonthKey): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short" });
}

export function dayLabel(dateKey: string): string {
  if (dateKey === todayKey()) return "Today";
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (dateKey === toDateKey(y)) return "Yesterday";
  const [yy, mm, dd] = dateKey.split("-").map(Number);
  return new Date(yy, mm - 1, dd).toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    // Search spans years; only spell the year out when it isn't this one.
    ...(yy !== new Date().getFullYear() && { year: "numeric" }),
  });
}
