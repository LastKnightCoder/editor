export interface IPublishRssSite {
  title: string;
  description: string;
  basePath: string;
  publicUrl?: string;
}

export interface IPublishFeedItem {
  type: "article" | "card" | "doc";
  id: number;
  title: string;
  summary: string;
  href: string;
  tags: string[];
  publishTime: number;
  updateTime: number;
  author?: string;
}

function normalizeBasePath(raw: string): string {
  const trimmed = raw?.trim() || "/";
  if (trimmed === "/") {
    return "/";
  }
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.endsWith("/")
    ? withLeadingSlash
    : `${withLeadingSlash}/`;
}

function joinUrlPath(basePath: string, path: string): string {
  const base = normalizeBasePath(basePath);
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  if (!normalizedPath) {
    return base;
  }
  return `${base}${normalizedPath}`;
}

export function normalizePublicUrl(value?: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return "";
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "";
    }
    return url.toString().replace(/\/+$/, "");
  } catch {
    return "";
  }
}

export function buildFeedUrl(site: IPublishRssSite, path: string): string {
  const urlPath = joinUrlPath(site.basePath, path);
  const publicUrl = normalizePublicUrl(site.publicUrl);
  if (!publicUrl) {
    return urlPath;
  }
  return `${publicUrl}${urlPath}`;
}

export function escapeXml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function getItemTime(item: IPublishFeedItem): number {
  return Math.max(item.updateTime || 0, item.publishTime || 0);
}

function formatRssDate(timestamp: number): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return new Date(0).toUTCString();
  }
  return date.toUTCString();
}

function renderItem(site: IPublishRssSite, item: IPublishFeedItem): string {
  const link = buildFeedUrl(site, item.href);
  const categories = (item.tags || [])
    .filter((tag) => tag.trim().length > 0)
    .map((tag) => `      <category>${escapeXml(tag)}</category>`)
    .join("\n");
  const author = item.author?.trim()
    ? `      <author>${escapeXml(item.author)}</author>\n`
    : "";
  const categoryBlock = categories ? `${categories}\n` : "";

  return `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="false">${escapeXml(`${item.type}:${item.id}`)}</guid>
      <description>${escapeXml(item.summary)}</description>
${author}${categoryBlock}      <pubDate>${formatRssDate(item.publishTime)}</pubDate>
    </item>`;
}

export function generateRssXml(
  site: IPublishRssSite,
  items: IPublishFeedItem[],
): string {
  const orderedItems = items
    .slice()
    .sort((a, b) => getItemTime(b) - getItemTime(a));
  const latestTime = orderedItems.reduce(
    (latest, item) => Math.max(latest, getItemTime(item)),
    0,
  );
  const channelLink = buildFeedUrl(site, "/");
  const feedLink = buildFeedUrl(site, "/rss.xml");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(site.title)}</title>
    <link>${escapeXml(channelLink)}</link>
    <description>${escapeXml(site.description)}</description>
    <atom:link href="${escapeXml(feedLink)}" rel="self" type="application/rss+xml" />
    <lastBuildDate>${formatRssDate(latestTime || Date.now())}</lastBuildDate>
${orderedItems.map((item) => renderItem(site, item)).join("\n")}
  </channel>
</rss>
`;
}

export function injectPublishRssLink(html: string, feedHref: string): string {
  const href = feedHref.trim();
  if (!href) {
    return html;
  }

  const rssLink = `<link rel="alternate" type="application/rss+xml" title="RSS" href="${escapeXml(href)}" />`;
  if (!html.includes("</head>")) {
    return `${rssLink}\n${html}`;
  }
  return html.replace("</head>", `${rssLink}\n</head>`);
}
