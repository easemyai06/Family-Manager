// Manual family availability statuses (no location tracking — see SOS for that).
export type StatusOption = { key: string; emoji: string; label: string };

export const STATUS_OPTIONS: StatusOption[] = [
  { key: "home", emoji: "🏡", label: "At home" },
  { key: "work", emoji: "💼", label: "At work" },
  { key: "school", emoji: "🏫", label: "At school" },
  { key: "available", emoji: "🌿", label: "Available" },
  { key: "busy", emoji: "⛔", label: "Busy" },
  { key: "travelling", emoji: "✈️", label: "Travelling" },
  { key: "vacation", emoji: "🏝️", label: "On vacation" },
  { key: "activity", emoji: "⚽", label: "Out & about" },
];

export function statusFor(key?: string | null): StatusOption | null {
  if (!key) return null;
  return STATUS_OPTIONS.find((s) => s.key === key) || null;
}
