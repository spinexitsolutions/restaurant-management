// Dish videos: YouTube links are embedded privately; direct .mp4/.webm links play inline.

export type Video = { type: "youtube"; id: string } | { type: "file"; url: string };

export function parseVideoUrl(raw: string): Video | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.replace(/^www\.|^m\./, "");
  const id =
    host === "youtu.be"
      ? url.pathname.slice(1)
      : host === "youtube.com"
        ? (url.searchParams.get("v") ?? url.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/)?.[1] ?? "")
        : "";
  if (id) return /^[\w-]{11}$/.test(id) ? { type: "youtube", id } : null;
  if (/\.(mp4|webm)$/i.test(url.pathname)) return { type: "file", url: url.toString() };
  return null;
}
