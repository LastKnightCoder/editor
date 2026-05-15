export type ParseResult =
  | { status: "ok"; nodes: any[] }
  | { status: "empty" }
  | { status: "invalid"; message: string };

export function parseSlateContent(
  content: string | null | undefined,
): ParseResult {
  if (!content) return { status: "empty" };
  try {
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) {
      return { status: "invalid", message: "content is not an array" };
    }
    if (parsed.length === 0) return { status: "empty" };
    return { status: "ok", nodes: parsed };
  } catch {
    return { status: "invalid", message: "failed to parse content" };
  }
}
