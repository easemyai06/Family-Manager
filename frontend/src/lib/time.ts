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
