import { ipcMain } from "electron";
import log from "electron-log";
import { Module } from "../types/module";
import { safeFetchHtml, safeFetchHead } from "./safe-fetch";

export interface DiscoveredFeed {
  url: string;
  title: string;
  type: "rss" | "atom" | "json";
}

function extractFeedsFromHtml(html: string, baseUrl: string): DiscoveredFeed[] {
  const feeds: DiscoveredFeed[] = [];
  const linkRegex = /<link[^>]*rel=["']alternate["'][^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(html)) !== null) {
    const tag = match[0];
    const typeMatch = tag.match(/type=["']([^"']+)["']/);
    const hrefMatch = tag.match(/href=["']([^"']+)["']/);
    const titleMatch = tag.match(/title=["']([^"']+)["']/);

    if (!typeMatch || !hrefMatch) continue;

    const type = typeMatch[1].toLowerCase();
    let feedType: "rss" | "atom" | "json" | null = null;

    if (
      type.includes("rss") ||
      type === "application/rss+xml" ||
      type === "text/xml"
    ) {
      feedType = "rss";
    } else if (type.includes("atom") || type === "application/atom+xml") {
      feedType = "atom";
    } else if (type.includes("json") || type === "application/feed+json") {
      feedType = "json";
    }

    if (!feedType) continue;

    let feedUrl = hrefMatch[1];
    if (feedUrl.startsWith("/")) {
      const parsed = new URL(baseUrl);
      feedUrl = `${parsed.origin}${feedUrl}`;
    } else if (!feedUrl.startsWith("http")) {
      feedUrl = new URL(feedUrl, baseUrl).toString();
    }

    feeds.push({
      url: feedUrl,
      title: titleMatch ? titleMatch[1] : feedUrl,
      type: feedType,
    });
  }

  return feeds;
}

const COMMON_FEED_PATHS = [
  "/feed",
  "/feed.xml",
  "/rss",
  "/rss.xml",
  "/atom.xml",
  "/index.xml",
  "/feed/rss",
  "/feed/atom",
  "/.rss",
];

async function probeFeedPaths(baseUrl: string): Promise<DiscoveredFeed[]> {
  const parsed = new URL(baseUrl);
  const origin = parsed.origin;
  const feeds: DiscoveredFeed[] = [];

  const checks = COMMON_FEED_PATHS.map(async (path) => {
    const url = `${origin}${path}`;
    const exists = await safeFetchHead(url);
    if (exists) {
      const type = path.includes("atom") ? "atom" : "rss";
      feeds.push({ url, title: `${origin}${path}`, type });
    }
  });

  await Promise.all(checks);
  return feeds;
}

class RssDiscoveryModule implements Module {
  name: string;

  constructor() {
    this.name = "rss-discovery";
  }

  async init(): Promise<void> {
    ipcMain.handle(
      "rss:discover-feeds",
      async (_event, url: string): Promise<DiscoveredFeed[]> => {
        return this.discoverFeeds(url);
      },
    );

    log.info("[RssDiscovery] initialized");
  }

  async discoverFeeds(url: string): Promise<DiscoveredFeed[]> {
    try {
      const html = await safeFetchHtml(url);
      const feeds = extractFeedsFromHtml(html, url);

      if (feeds.length > 0) {
        return feeds;
      }

      return await probeFeedPaths(url);
    } catch (error: any) {
      log.error(`[RssDiscovery] Failed to discover feeds for ${url}:`, error);
      return [];
    }
  }
}

export default new RssDiscoveryModule();
