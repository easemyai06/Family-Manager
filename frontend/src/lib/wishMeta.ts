// Shared presets & helpers for the Wish List feature.

export const OCCASIONS: { key: string; label: string; emoji: string }[] = [
  { key: "Birthday", label: "Birthday", emoji: "🎂" },
  { key: "Christmas", label: "Christmas", emoji: "🎄" },
  { key: "Diwali", label: "Diwali", emoji: "🪔" },
  { key: "Eid", label: "Eid", emoji: "🌙" },
  { key: "Achievement", label: "Achievement", emoji: "🏆" },
  { key: "Holiday", label: "Holiday", emoji: "🏖️" },
  { key: "Special", label: "Special", emoji: "✨" },
  { key: "General", label: "General", emoji: "🎁" },
];

export const CATEGORIES: { key: string; label: string; emoji: string }[] = [
  { key: "General", label: "General", emoji: "🎁" },
  { key: "Experience", label: "Experience", emoji: "🎢" },
  { key: "Books", label: "Books", emoji: "📚" },
  { key: "Toys", label: "Toys", emoji: "🧸" },
  { key: "Clothes", label: "Clothes", emoji: "👕" },
  { key: "Games", label: "Games", emoji: "🎮" },
  { key: "Sports", label: "Sports", emoji: "⚽" },
  { key: "Gadgets", label: "Gadgets", emoji: "📱" },
  { key: "Trips", label: "Trips", emoji: "✈️" },
  { key: "Activities", label: "Activities", emoji: "🎨" },
];

export const VISIBILITIES: { key: string; label: string; icon: string }[] = [
  { key: "family", label: "Entire Family", icon: "people" },
  { key: "parents", label: "Parents Only", icon: "shield" },
  { key: "grandparents", label: "Grandparents", icon: "heart" },
  { key: "selected", label: "Selected", icon: "person-add" },
];

export const PRIORITY = [
  { v: 1, label: "Nice to have", stars: "⭐" },
  { v: 2, label: "Would love", stars: "⭐⭐" },
  { v: 3, label: "Really want", stars: "⭐⭐⭐" },
];

export const STATUS_META: Record<string, { label: string; emoji: string; color: string }> = {
  wished: { label: "Wished for", emoji: "💭", color: "#8AB07D" },
  reserved: { label: "Reserved", emoji: "🎁", color: "#E8A33D" },
  purchased: { label: "Purchased", emoji: "🛍️", color: "#7FA9C9" },
  received: { label: "Received", emoji: "✅", color: "#8AB07D" },
};

export function occasionMeta(key?: string | null) {
  return OCCASIONS.find((o) => o.key === key);
}
export function categoryMeta(key?: string | null) {
  return CATEGORIES.find((c) => c.key === key);
}
export function priorityMeta(v?: number) {
  return PRIORITY.find((p) => p.v === (v || 2)) || PRIORITY[1];
}
