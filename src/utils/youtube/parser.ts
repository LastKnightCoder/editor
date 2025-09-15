export function isYoutubeUrl(url: string): boolean {
  try {
    const u = new URL(url.trim());
    const host = u.hostname.toLowerCase();
    return (
      host.includes("youtube.com") ||
      host.includes("youtu.be") ||
      host.endsWith("yewtu.be")
    );
  } catch {
    return false;
  }
}

export function parseYoutubeUrl(url: string): { videoId?: string } {
  try {
    const u = new URL(url.trim());
    const host = u.hostname.toLowerCase();
    if (host.includes("youtu.be")) {
      const id = u.pathname.replace(/^\//, "");
      return { videoId: id || undefined };
    }
    if (host.includes("youtube.com")) {
      if (u.pathname.startsWith("/watch")) {
        return { videoId: u.searchParams.get("v") || undefined };
      }
      if (u.pathname.startsWith("/shorts/")) {
        return { videoId: u.pathname.split("/")[2] };
      }
      if (u.pathname.startsWith("/embed/")) {
        return { videoId: u.pathname.split("/")[2] };
      }
    }
    return {};
  } catch {
    return {};
  }
}
