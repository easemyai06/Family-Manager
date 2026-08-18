import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

export function timeAgo(iso?: string) {
  if (!iso) return "";
  return dayjs(iso).fromNow();
}

export function formatDate(iso?: string, fmt = "ddd, D MMM") {
  if (!iso) return "";
  return dayjs(iso).format(fmt);
}

// dd-mm-yyyy (family-friendly, matches how most of the world writes dates)
export function formatDMY(iso?: string | null) {
  if (!iso) return "";
  const d = dayjs(iso);
  return d.isValid() ? d.format("DD-MM-YYYY") : "";
}

// e.g. "05-06-2026 · 3:30 PM"
export function formatDMYTime(iso?: string | null) {
  if (!iso) return "";
  const d = dayjs(iso);
  return d.isValid() ? d.format("DD-MM-YYYY · h:mm A") : "";
}

// pretty birthday like "5 June" (+ optional year)
export function formatBirthday(iso?: string | null, withYear = false) {
  if (!iso) return "";
  const d = dayjs(iso);
  if (!d.isValid()) return "";
  return d.format(withYear ? "D MMMM YYYY" : "D MMMM");
}

export function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good Morning";
  if (h < 17) return "Good Afternoon";
  return "Good Evening";
}

export function ageFrom(birthday?: string | null) {
  if (!birthday) return null;
  return dayjs().diff(dayjs(birthday), "year");
}

// Days until the member's NEXT birthday (0 = today). null if no/invalid date.
export function daysUntilBirthday(iso?: string | null): number | null {
  if (!iso) return null;
  const d = dayjs(iso);
  if (!d.isValid()) return null;
  const today = dayjs().startOf("day");
  let next = d.year(today.year()).startOf("day");
  if (next.isBefore(today)) next = next.add(1, "year");
  return next.diff(today, "day");
}

// Friendly countdown label ("Today", "Tomorrow", "in 5 days").
export function birthdayCountdown(iso?: string | null): string | null {
  const n = daysUntilBirthday(iso);
  if (n == null) return null;
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  return `in ${n} days`;
}
