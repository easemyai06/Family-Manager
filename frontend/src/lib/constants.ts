// Shared constants: affection types, reaction types, categories.

export type AffectionKey =
  | "hug" | "kiss" | "love" | "lots_of_love" | "miss_you" | "thinking_of_you"
  | "proud" | "got_this" | "good_morning" | "good_night" | "birthday_love" | "congrats";

export const AFFECTIONS: { key: AffectionKey; emoji: string; label: string; color: string }[] = [
  { key: "hug", emoji: "🤗", label: "Hug", color: "#FF9E9E" },
  { key: "kiss", emoji: "😘", label: "Kiss", color: "#FF6B6B" },
  { key: "love", emoji: "❤️", label: "Love", color: "#E05757" },
  { key: "lots_of_love", emoji: "🥰", label: "Lots of Love", color: "#FF6B6B" },
  { key: "miss_you", emoji: "🫶", label: "Miss You", color: "#D98E5A" },
  { key: "thinking_of_you", emoji: "🌹", label: "Thinking of You", color: "#C96F4A" },
  { key: "proud", emoji: "⭐", label: "Proud of You", color: "#FFD166" },
  { key: "got_this", emoji: "💪", label: "You've Got This", color: "#8AB07D" },
  { key: "good_morning", emoji: "🌞", label: "Good Morning", color: "#FFD166" },
  { key: "good_night", emoji: "🌙", label: "Good Night", color: "#A3B18A" },
  { key: "birthday_love", emoji: "🎂", label: "Birthday Love", color: "#FF9E9E" },
  { key: "congrats", emoji: "🎉", label: "Congrats", color: "#FFD166" },
];

export const AFFECTION_MAP: Record<string, { emoji: string; label: string; color: string }> =
  Object.fromEntries(AFFECTIONS.map((a) => [a.key, { emoji: a.emoji, label: a.label, color: a.color }]));

export type ReactionKey = "love" | "adore" | "hug" | "kiss" | "proud" | "laugh" | "celebrate";

export const REACTIONS: { key: ReactionKey; emoji: string; label: string }[] = [
  { key: "love", emoji: "❤️", label: "Love" },
  { key: "adore", emoji: "🥰", label: "Adore" },
  { key: "hug", emoji: "🤗", label: "Hug" },
  { key: "kiss", emoji: "😘", label: "Kiss" },
  { key: "proud", emoji: "👏", label: "Proud" },
  { key: "laugh", emoji: "😂", label: "Laugh" },
  { key: "celebrate", emoji: "🎉", label: "Celebrate" },
];

export const REACTION_MAP: Record<string, string> = Object.fromEntries(
  REACTIONS.map((r) => [r.key, r.emoji])
);

export const EVENT_CATEGORIES = [  { key: "family", label: "Family", icon: "people" },
  { key: "school", label: "School", icon: "school" },
  { key: "sports", label: "Sports", icon: "football" },
  { key: "birthday", label: "Birthday", icon: "gift" },
  { key: "health", label: "Health", icon: "medkit" },
  { key: "holiday", label: "Holiday", icon: "sunny" },
  { key: "other", label: "Other", icon: "calendar" },
];

export const POST_CATEGORIES = [
  "📸 Everyday", "🏆 Achievement", "🏅 Sports", "✈️ Vacation",
  "🎂 Birthday", "🎉 Celebration", "🎨 Artwork", "📚 School",
];

export const MSG_REACTIONS = ["❤️", "😂", "👍", "😮", "😢", "🎉"];

export const TIMELINE_CATEGORIES = [
  "🎂 Birthdays", "👶 Births", "💍 Weddings", "❤️ Anniversaries", "🎓 Education",
  "🏆 Achievements", "🏠 New Homes", "💼 Careers", "✈️ Vacations", "🚗 Road Trips",
  "🎉 Celebrations", "🏅 Sports", "🎭 Performances", "📚 School Events", "🐶 Pets",
  "🌍 Relocations", "👨‍👩‍👧 Gatherings", "🎄 Festivals", "📸 Everyday Memories",
];
