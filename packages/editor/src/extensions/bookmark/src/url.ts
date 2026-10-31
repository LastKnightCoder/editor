/** 像域名的补 https://，其余原样返回。 */
export function normalizeBookmarkUrl(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  if (/^[a-z][\w+.-]*:\/\//i.test(value)) return value;
  if (/^(localhost|[\w-]+(\.[\w-]+)+)(:\d+)?([/?#]|$)/i.test(value)) return `https://${value}`;
  return value;
}

/** 书签只接受 http(s) 网址 */
export function isBookmarkUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && !!url.host;
  } catch {
    return false;
  }
}
