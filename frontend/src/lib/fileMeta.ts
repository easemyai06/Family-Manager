// Helpers for chat file attachments + shared locations.

type IoniconName = string;

// Pick a friendly icon + colour for a document based on its mime/extension.
export function fileIcon(name?: string | null, mime?: string | null): { icon: IoniconName; color: string } {
  const n = (name || "").toLowerCase();
  const m = (mime || "").toLowerCase();
  const is = (...exts: string[]) => exts.some((e) => n.endsWith("." + e));
  if (m.includes("pdf") || is("pdf")) return { icon: "document-text", color: "#E05A5A" };
  if (m.includes("word") || is("doc", "docx")) return { icon: "document", color: "#3A7BD5" };
  if (m.includes("sheet") || m.includes("excel") || m.includes("csv") || is("xls", "xlsx", "csv"))
    return { icon: "grid", color: "#2E9E6B" };
  if (m.includes("presentation") || m.includes("powerpoint") || is("ppt", "pptx"))
    return { icon: "easel", color: "#E8873D" };
  if (m.includes("zip") || is("zip", "rar", "7z")) return { icon: "archive", color: "#8A7CC9" };
  if (m.startsWith("image/") || is("png", "jpg", "jpeg", "gif", "heic", "webp"))
    return { icon: "image", color: "#D98E5A" };
  if (m.startsWith("audio/") || is("mp3", "wav", "m4a")) return { icon: "musical-notes", color: "#C96FA4" };
  if (m.startsWith("video/") || is("mp4", "mov", "avi")) return { icon: "videocam", color: "#5A8FE0" };
  return { icon: "document-attach", color: "#8A8A8A" };
}

// Human-friendly file size (e.g. "1.2 MB").
export function formatFileSize(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n >= 10 || i === 0 ? Math.round(n) : n.toFixed(1)} ${units[i]}`;
}

// Cross-platform maps URL for a lat/lng pin.
export function mapsUrl(lat: number, lng: number, label?: string): string {
  const q = `${lat},${lng}`;
  const name = label ? encodeURIComponent(label) : "";
  return `https://www.google.com/maps/search/?api=1&query=${q}${name ? `&query_place_id=${name}` : ""}`;
}

// A small static map preview image (OpenStreetMap-based, no key required).
export function staticMapUrl(lat: number, lng: number, w = 420, h = 200): string {
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=15&size=${w}x${h}&markers=${lat},${lng},red-pushpin`;
}
