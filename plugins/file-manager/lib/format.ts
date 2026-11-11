import {
  defineMessages,
  getLang,
  intlLocale,
  messagesNow,
  pluralRu,
} from "./i18n";

const messages = defineMessages(
  {
    units: "B KB MB GB TB PB",
    decimal: ".",
    bytes: (count: number, digits: string) =>
      `${digits} ${count === 1 ? "byte" : "bytes"}`,
    perSecond: (size: string) => `${size}/s`,
    seconds: (n: number) => `${String(n)}s`,
    minutes: (n: number) => `${String(n)}m`,
    hours: (n: number) => `${String(n)}h`,
    days: (n: number) => `${String(n)}d`,
    left: (duration: string) => `${duration} left`,
    justNow: "just now",
    ago: (duration: string) => `${duration} ago`,
  },
  {
    units: "Б КБ МБ ГБ ТБ ПБ",
    decimal: ",",
    bytes: (count, digits) =>
      `${digits} ${pluralRu(count, ["байт", "байта", "байт"])}`,
    perSecond: (size) => `${size}/с`,
    seconds: (n) => `${String(n)} с`,
    minutes: (n) => `${String(n)} мин`,
    hours: (n) => `${String(n)} ч`,
    days: (n) => `${String(n)} дн.`,
    left: (duration) => `осталось ${duration}`,
    justNow: "только что",
    ago: (duration) => `${duration} назад`,
  },
);

const STEP = 1024;

function locale(): string {
  return intlLocale(getLang());
}

export const UNKNOWN = "—";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function trimZero(text: string): string {
  return text.endsWith(".0") ? text.slice(0, -2) : text;
}

export function formatBytes(bytes: number): string {
  if (!isFiniteNumber(bytes) || bytes < 0) return UNKNOWN;
  const t = messagesNow(messages);
  const UNITS = t.units.split(" ");
  if (bytes < STEP) return `${Math.round(bytes)} ${UNITS[0] ?? ""}`;

  let value = bytes;
  let unit = 0;
  while (value >= STEP && unit < UNITS.length - 1) {
    value /= STEP;
    unit += 1;
  }
  const decimals = value >= 100 ? 0 : 1;
  return `${trimZero(value.toFixed(decimals)).replace(".", t.decimal)} ${UNITS[unit] ?? ""}`;
}

export function formatExactBytes(bytes: number): string {
  if (!isFiniteNumber(bytes) || bytes < 0) return UNKNOWN;
  const count = Math.round(bytes);
  return messagesNow(messages).bytes(count, count.toLocaleString(locale()));
}

export function formatSpeed(bytesPerSecond: number): string {
  if (!isFiniteNumber(bytesPerSecond) || bytesPerSecond <= 0) return UNKNOWN;
  return messagesNow(messages).perSecond(formatBytes(bytesPerSecond));
}

export function formatPercent(ratio: number): string {
  if (!isFiniteNumber(ratio)) return UNKNOWN;
  const clamped = Math.min(1, Math.max(0, ratio));
  return `${Math.round(clamped * 100)}%`;
}

export function progressRatio(sentBytes: number, totalBytes: number): number {
  if (
    !isFiniteNumber(sentBytes) ||
    !isFiniteNumber(totalBytes) ||
    totalBytes <= 0
  )
    return 0;
  return Math.min(1, Math.max(0, sentBytes / totalBytes));
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function formatDuration(ms: number | null): string {
  if (ms === null || !isFiniteNumber(ms) || ms < 0) return UNKNOWN;

  const t = messagesNow(messages);
  const seconds = Math.round(ms / SECOND);
  if (seconds < 60) return t.seconds(seconds);

  const minutes = Math.floor(seconds / 60);
  const remainderSeconds = seconds % 60;
  if (minutes < 60) {
    return remainderSeconds === 0
      ? t.minutes(minutes)
      : `${t.minutes(minutes)} ${t.seconds(remainderSeconds)}`;
  }

  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const remainderMinutes = totalMinutes % 60;
  if (hours < 24) {
    return remainderMinutes === 0
      ? t.hours(hours)
      : `${t.hours(hours)} ${t.minutes(remainderMinutes)}`;
  }

  const totalHours = Math.round(totalMinutes / 60);
  const days = Math.floor(totalHours / 24);
  const remainderHours = totalHours % 24;
  return remainderHours === 0
    ? t.days(days)
    : `${t.days(days)} ${t.hours(remainderHours)}`;
}

export function formatEta(etaMs: number | null): string {
  if (etaMs === null || !isFiniteNumber(etaMs) || etaMs < 0) return "";
  return messagesNow(messages).left(formatDuration(etaMs));
}

export function etaFromRate(
  remainingBytes: number,
  bytesPerSecond: number,
): number | null {
  if (!isFiniteNumber(remainingBytes) || remainingBytes <= 0) return 0;
  if (!isFiniteNumber(bytesPerSecond) || bytesPerSecond <= 0) return null;
  return (remainingBytes / bytesPerSecond) * SECOND;
}

export function formatRelativeTime(
  timestampMs: number,
  nowMs: number = Date.now(),
): string {
  if (!isFiniteNumber(timestampMs)) return UNKNOWN;
  const delta = nowMs - timestampMs;
  if (delta < 0) return formatDate(timestampMs);
  const t = messagesNow(messages);
  if (delta < MINUTE) return t.justNow;
  if (delta < HOUR) return t.ago(t.minutes(Math.floor(delta / MINUTE)));
  if (delta < DAY) return t.ago(t.hours(Math.floor(delta / HOUR)));
  if (delta < 7 * DAY) return t.ago(t.days(Math.floor(delta / DAY)));
  return formatDate(timestampMs);
}

export function formatDate(
  timestampMs: number,
  nowMs: number = Date.now(),
): string {
  if (!isFiniteNumber(timestampMs)) return UNKNOWN;
  const date = new Date(timestampMs);
  if (Number.isNaN(date.valueOf())) return UNKNOWN;
  const sameYear = date.getFullYear() === new Date(nowMs).getFullYear();
  return date.toLocaleDateString(locale(), {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

export function formatDateTime(timestampMs: number): string {
  if (!isFiniteNumber(timestampMs)) return UNKNOWN;
  const date = new Date(timestampMs);
  if (Number.isNaN(date.valueOf())) return UNKNOWN;
  return date.toLocaleString(locale(), {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatModified(
  timestampMs: number,
  nowMs: number = Date.now(),
): string {
  if (!isFiniteNumber(timestampMs)) return UNKNOWN;
  const date = new Date(timestampMs);
  if (Number.isNaN(date.valueOf())) return UNKNOWN;
  const now = new Date(nowMs);
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return date.toLocaleTimeString(locale(), {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return formatDate(timestampMs, nowMs);
}

export function formatCount(
  count: number,
  singular: string,
  plural = `${singular}s`,
): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
