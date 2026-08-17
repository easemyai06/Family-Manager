// Shared dashboard config: personas, section ordering + user customization.
export type Persona = "parent" | "child" | "grandparent";
export type DashPrefs = { order: string[]; hidden: string[]; pinned: string[]; compact: boolean };

export const EMPTY_PREFS: DashPrefs = { order: [], hidden: [], pinned: [], compact: false };

export function personaOf(me: any): Persona {
  if (!me) return "parent";
  const rel = (me.relationship || "").toLowerCase();
  if (me.is_child || me.role === "child") return "child";
  if (/grand|nani|dadi|nana|dada/.test(rel)) return "grandparent";
  return "parent";
}

export const ORDER: Record<Persona, string[]> = {
  parent: [
    "attention", "today", "tasks", "kids", "meals", "shopping", "comingup",
    "noticeboard", "memory", "wishlist", "important", "emergency", "recap", "brief", "latest", "quick",
  ],
  child: [
    "today", "mychores", "mytasks", "noticeboard", "comingup", "memory", "wishlist", "recap", "brief", "latest", "quick",
  ],
  grandparent: [
    "today", "comingup", "noticeboard", "memory", "wishlist", "emergency", "recap", "brief", "latest", "quick",
  ],
};

export const SECTION_META: Record<string, { label: string; emoji: string }> = {
  attention: { label: "Needs Attention", emoji: "🔔" },
  today: { label: "Today at a Glance", emoji: "📅" },
  tasks: { label: "Family Tasks", emoji: "✅" },
  mytasks: { label: "My Tasks", emoji: "✅" },
  kids: { label: "Kids & Chores", emoji: "⭐" },
  mychores: { label: "My Chores", emoji: "⭐" },
  meals: { label: "Today's Meals", emoji: "🍽️" },
  shopping: { label: "Shopping", emoji: "🛒" },
  comingup: { label: "Coming Up", emoji: "🗓️" },
  noticeboard: { label: "Family Noticeboard", emoji: "📌" },
  memory: { label: "Memory of the Day", emoji: "📸" },
  wishlist: { label: "Wish List Reminder", emoji: "🎁" },
  important: { label: "Important Information", emoji: "🔐" },
  emergency: { label: "Emergency", emoji: "🚑" },
  recap: { label: "Evening Recap", emoji: "🌙" },
  brief: { label: "Daily Brief", emoji: "📊" },
  latest: { label: "Latest Post", emoji: "📝" },
  quick: { label: "Quick Actions", emoji: "⚡" },
};

export function baseOrderFor(me: any): string[] {
  return ORDER[personaOf(me)];
}

// Full ordering including hidden entries, forward-compatible with new sections.
export function rawOrder(base: string[], saved: string[]): string[] {
  const known = new Set(base);
  const out = (saved || []).filter((k) => known.has(k));
  for (const k of base) if (!out.includes(k)) out.push(k);
  return out;
}

// The effective render order: saved order, minus hidden, pinned floated to top.
export function applyPrefs(base: string[], prefs: DashPrefs): string[] {
  let ordered = rawOrder(base, prefs?.order || []);
  const hidden = new Set(prefs?.hidden || []);
  ordered = ordered.filter((k) => !hidden.has(k));
  const pinned = new Set(prefs?.pinned || []);
  const p = ordered.filter((k) => pinned.has(k));
  const r = ordered.filter((k) => !pinned.has(k));
  return [...p, ...r];
}
