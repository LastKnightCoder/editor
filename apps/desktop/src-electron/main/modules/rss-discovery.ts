import { ipcMain } from "electron";
import log from "electron-log";
import { Module } from "../types/module";
import { safeFetchHtml } from "./safe-fetch";
import { parseFeedXml as parseFeedXmlLite } from "./rss-parser-lite";
import {
  BILIBILI_FOLLOWINGS_DYNAMIC_URL,
  buildBilibiliUserVideoUrl,
  parseBilibiliSpaceUrl,
  parseLocalBilibiliFeedUrl,
  previewBilibiliFeed,
} from "./rss-bilibili";

export interface DiscoveredFeed {
  url: string;
  title: string;
  type: "rss" | "atom" | "json";
}

interface FeedPreviewEntry {
  title: string;
  url: string | null;
  publishedAt: number | null;
}

type FeedPreviewResult =
  | {
      valid: true;
      url: string;
      finalUrl: string;
      title: string;
      siteUrl: string | null;
      description: string | null;
      feedType: "rss" | "atom" | "json";
      entriesPreview: FeedPreviewEntry[];
    }
  | {
      valid: false;
      url: string;
      errorCode:
        | "invalid_url"
        | "unsafe_url"
        | "timeout"
        | "http_error"
        | "not_feed"
        | "parse_failed"
        | "network_error";
      message: string;
    };

const RSS_ACCEPT =
  "application/rss+xml, application/atom+xml, application/feed+json, application/json, application/xml, text/xml, */*";

function normalizeHttpUrl(value: string): string {
  if (parseLocalBilibiliFeedUrl(value)) {
    return value.trim();
  }
  const parsed = new URL(value.trim());
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Blocked scheme: ${parsed.protocol}`);
  }
  return parsed.toString();
}

function detectFeedType(xml: string): "rss" | "atom" | "json" {
  const head = xml.trimStart().slice(0, 2000).toLowerCase();
  if (head.startsWith("{") || head.includes('"version"')) return "json";
  if (head.includes("<feed")) return "atom";
  return "rss";
}

function parseDate(value: unknown): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

function previewFromParsedFeed(
  feed: ReturnType<typeof parseFeedXmlLite>,
  inputUrl: string,
  finalUrl: string,
  xml: string,
): FeedPreviewResult {
  const title = feed.title || finalUrl;
  const entriesPreview = feed.entries.slice(0, 5).map((entry) => ({
    title: entry.title || "(无标题)",
    url: entry.link,
    publishedAt: parseDate(entry.published),
  }));

  return {
    valid: true,
    url: inputUrl,
    finalUrl,
    title,
    siteUrl: feed.link,
    description: feed.description,
    feedType: detectFeedType(xml),
    entriesPreview,
  };
}

function parseFeedPreviewXml(
  xml: string,
  inputUrl: string,
  finalUrl: string,
): FeedPreviewResult {
  const feed = parseFeedXmlLite(xml);
  return previewFromParsedFeed(feed, inputUrl, finalUrl, xml);
}

function mapPreviewError(url: string, error: unknown): FeedPreviewResult {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (url === BILIBILI_FOLLOWINGS_DYNAMIC_URL || url.startsWith("tau://")) {
    return {
      valid: false,
      url,
      errorCode: "network_error",
      message,
    };
  }
  if (lower.includes("invalid url")) {
    return {
      valid: false,
      url,
      errorCode: "invalid_url",
      message: "链接格式不正确",
    };
  }
  if (lower.includes("blocked scheme") || lower.includes("blocked host")) {
    return {
      valid: false,
      url,
      errorCode: "unsafe_url",
      message: "订阅地址不安全，已阻止访问",
    };
  }
  if (lower.includes("timeout")) {
    return {
      valid: false,
      url,
      errorCode: "timeout",
      message: "请求超时，请稍后重试",
    };
  }
  if (/http\s+\d+/i.test(message)) {
    return {
      valid: false,
      url,
      errorCode: "http_error",
      message: `源站请求失败：${message}`,
    };
  }
  if (
    lower.includes("rss") ||
    lower.includes("atom") ||
    lower.includes("xml") ||
    lower.includes("parse")
  ) {
    return {
      valid: false,
      url,
      errorCode: "not_feed",
      message: "响应不是合法的 RSS/Atom 源",
    };
  }
  return {
    valid: false,
    url,
    errorCode: "network_error",
    message: "校验失败，请稍后重试",
  };
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
    const preview = await previewFeedUrl(url);
    if (preview.valid) {
      feeds.push({ url, title: preview.title, type: preview.feedType });
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

    ipcMain.handle(
      "rss:preview-feed",
      async (_event, url: string): Promise<FeedPreviewResult> => {
        return previewFeedUrl(url);
      },
    );

    log.info("[RssDiscovery] initialized");
  }

  async discoverFeeds(url: string): Promise<DiscoveredFeed[]> {
    try {
      const bilibiliUid = parseBilibiliSpaceUrl(url);
      if (bilibiliUid) {
        return [
          {
            url: buildBilibiliUserVideoUrl(bilibiliUid),
            title: `Bilibili UP ${bilibiliUid} 投稿`,
            type: "rss",
          },
        ];
      }

      const normalizedUrl = normalizeHttpUrl(url);
      console.log("[RSS] discover start", { url: normalizedUrl });

      const directPreview = await previewFeedUrl(normalizedUrl);
      if (directPreview.valid) {
        console.log("[RSS] direct feed detected", {
          url: normalizedUrl,
          title: directPreview.title,
          feedType: directPreview.feedType,
        });
        return [
          {
            url: directPreview.finalUrl,
            title: directPreview.title,
            type: directPreview.feedType,
          },
        ];
      }

      const html = await safeFetchHtml(normalizedUrl, {
        timeoutMs: 10_000,
        maxBytes: 2 * 1024 * 1024,
      });
      const feeds = extractFeedsFromHtml(html, normalizedUrl);

      if (feeds.length > 0) {
        console.log("[RSS] html alternate feeds found", {
          url: normalizedUrl,
          count: feeds.length,
        });
        return feeds;
      }

      const probed = await probeFeedPaths(normalizedUrl);
      console.log("[RSS] path probe complete", {
        url: normalizedUrl,
        count: probed.length,
      });
      return probed;
    } catch (error: any) {
      log.error(`[RssDiscovery] Failed to discover feeds for ${url}:`, error);
      return [];
    }
  }
}

export async function previewFeedUrl(url: string): Promise<FeedPreviewResult> {
  try {
    const normalizedUrl = normalizeHttpUrl(url);
    console.log("[RSS] preview start", { url: normalizedUrl });
    if (parseLocalBilibiliFeedUrl(normalizedUrl)) {
      const preview = await previewBilibiliFeed(normalizedUrl);
      return {
        valid: true,
        url: normalizedUrl,
        finalUrl: normalizedUrl,
        title: preview.title,
        siteUrl: preview.siteUrl,
        description: preview.description,
        feedType: "rss",
        entriesPreview: preview.entriesPreview,
      };
    }

    const xml = await safeFetchHtml(normalizedUrl, {
      accept: RSS_ACCEPT,
      timeoutMs: 15_000,
      maxBytes: 5 * 1024 * 1024,
    });
    const result = parseFeedPreviewXml(xml, normalizedUrl, normalizedUrl);
    console.log("[RSS] preview success", {
      url: normalizedUrl,
      title: result.valid ? result.title : undefined,
      entries: result.valid ? result.entriesPreview.length : 0,
    });
    return result;
  } catch (error) {
    const result = mapPreviewError(url, error);
    console.log("[RSS] preview failed", {
      url,
      errorCode: result.valid ? undefined : result.errorCode,
      message: result.valid ? undefined : result.message,
    });
    return result;
  }
}

export default new RssDiscoveryModule();
