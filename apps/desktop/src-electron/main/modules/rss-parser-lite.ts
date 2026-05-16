export interface ParsedFeedEntry {
  id: string | null;
  title: string | null;
  link: string | null;
  description: string | null;
  contentHtml: string | null;
  creator: string | null;
  categories: string[];
  published: string | null;
}

export interface ParsedFeed {
  title: string | null;
  description: string | null;
  link: string | null;
  entries: ParsedFeedEntry[];
}

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .trim();
}

function stripTags(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getTagContent(xml: string, tag: string): string | null {
  const source = escapeRegExp(tag);
  const match = xml.match(
    new RegExp(`<${source}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${source}>`, "i"),
  );
  return match?.[1] ? decodeXml(match[1]) : null;
}

function getAllTagContent(xml: string, tag: string): string[] {
  const source = escapeRegExp(tag);
  const matches = xml.matchAll(
    new RegExp(`<${source}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${source}>`, "gi"),
  );
  return Array.from(matches, (match) => decodeXml(match[1] ?? "")).filter(
    Boolean,
  );
}

function getBlocks(xml: string, tag: string): string[] {
  const source = escapeRegExp(tag);
  const matches = xml.matchAll(
    new RegExp(`<${source}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${source}>`, "gi"),
  );
  return Array.from(matches, (match) => match[1] ?? "");
}

function normalizeUrl(
  value: string | null,
  baseUrl?: string | null,
): string | null {
  if (!value) return null;
  try {
    const normalized = value.startsWith("//") ? `https:${value}` : value;
    const parsed = baseUrl ? new URL(normalized, baseUrl) : new URL(normalized);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return value.trim() || null;
  }
}

function getAtomLink(xml: string, baseUrl?: string | null): string | null {
  const linkTags = Array.from(xml.matchAll(/<link\s+([^>]*)\/?>/gi));
  const alternate =
    linkTags.find((match) => !/\brel\s*=\s*["'][^"']*self/i.test(match[1])) ||
    linkTags[0];
  if (!alternate?.[1]) return null;
  const hrefMatch = alternate[1].match(/\bhref\s*=\s*["']([^"']+)["']/i);
  return normalizeUrl(hrefMatch?.[1] ?? null, baseUrl);
}

function parseRss(xml: string): ParsedFeed {
  const channel = getBlocks(xml, "channel")[0] ?? xml;
  const link = normalizeUrl(getTagContent(channel, "link"));
  const entries = getBlocks(channel, "item").map((item) => {
    const itemLink = normalizeUrl(getTagContent(item, "link"), link);
    const contentHtml = getTagContent(item, "content:encoded");
    return {
      id: getTagContent(item, "guid"),
      title: getTagContent(item, "title"),
      link: itemLink,
      description: getTagContent(item, "description"),
      contentHtml,
      creator:
        getTagContent(item, "dc:creator") || getTagContent(item, "author"),
      categories: getAllTagContent(item, "category"),
      published:
        getTagContent(item, "pubDate") ||
        getTagContent(item, "published") ||
        getTagContent(item, "updated"),
    };
  });

  return {
    title: getTagContent(channel, "title"),
    description: getTagContent(channel, "description"),
    link,
    entries,
  };
}

function parseAtom(xml: string): ParsedFeed {
  const feedLink = getAtomLink(xml);
  const entries = getBlocks(xml, "entry").map((entry) => {
    const itemLink = getAtomLink(entry, feedLink);
    const summary = getTagContent(entry, "summary");
    const content = getTagContent(entry, "content");
    return {
      id: getTagContent(entry, "id"),
      title: getTagContent(entry, "title"),
      link: itemLink,
      description: summary ? stripTags(summary) : null,
      contentHtml: content,
      creator:
        getTagContent(getBlocks(entry, "author")[0] ?? "", "name") ||
        getTagContent(entry, "author"),
      categories: Array.from(entry.matchAll(/<category\s+([^>]*)\/?>/gi))
        .map((match) => {
          const term = match[1]?.match(/\bterm\s*=\s*["']([^"']+)["']/i)?.[1];
          return term ? decodeXml(term) : null;
        })
        .filter((value): value is string => Boolean(value)),
      published:
        getTagContent(entry, "published") || getTagContent(entry, "updated"),
    };
  });

  return {
    title: getTagContent(xml, "title"),
    description: getTagContent(xml, "subtitle"),
    link: feedLink,
    entries,
  };
}

export function parseFeedXml(xml: string): ParsedFeed {
  const head = xml.trimStart().slice(0, 2000).toLowerCase();
  const feed = head.includes("<feed") ? parseAtom(xml) : parseRss(xml);
  if (!feed.entries.length) {
    throw new Error("Failed to parse feed or no entries");
  }
  return feed;
}
