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
