import { BrowserWindow, ipcMain, net } from "electron";
import log from "electron-log";
import { Module } from "../types/module";
import databaseModule from "./database";
import { parseFeedXml } from "./rss-parser-lite";
import { fetchBilibiliFeed, parseLocalBilibiliFeedUrl } from "./rss-bilibili";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

interface FetchResult {
  feedId: number;
  newCount: number;
  error?: string;
}

function fetchUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = net.request({
      method: "GET",
      url,
      headers: {
        "User-Agent": USER_AGENT,
        Accept:
          "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      },
    });
    let body = "";
    request.on("response", (response) => {
      if (response.statusCode && response.statusCode >= 400) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      response.on("data", (chunk) => {
        body += chunk.toString();
      });
      response.on("end", () => resolve(body));
      response.on("error", (err) => reject(err));
    });
    request.on("error", (err) => reject(err));
    request.end();
  });
}

class RssFetcherModule implements Module {
  name: string;
  private checkInterval: NodeJS.Timeout | null = null;
  private fetchingFeeds: Set<number> = new Set();
  private readonly CHECK_INTERVAL = 5 * 60 * 1000;
  private readonly MAX_CONCURRENT = 3;

  constructor() {
    this.name = "rss-fetcher";
  }

  async init(): Promise<void> {
    ipcMain.handle("rss:refresh-feed", async (_event, feedId: number) => {
      return this.refreshFeed(feedId);
    });

    ipcMain.handle("rss:refresh-all", async () => {
      return this.refreshAll();
    });

    ipcMain.handle("rss:get-fetch-status", async () => {
      return {
        fetchingFeeds: Array.from(this.fetchingFeeds),
        isRunning: this.checkInterval !== null,
      };
    });

    databaseModule.onDatabaseChange(() => {
      this.fetchingFeeds.clear();
    });

    this.startChecking();
    log.info("[RssFetcher] initialized");
  }

  private startChecking(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
    this.checkInterval = setInterval(() => {
      this.checkAndFetch();
    }, this.CHECK_INTERVAL);
  }

  private async checkAndFetch(): Promise<void> {
    const db = databaseModule.getCurrentDatabase();
    if (!db) return;

    const now = Date.now();
    const dueFeeds = db
      .prepare(
        `SELECT * FROM rss_feed
         WHERE is_active = 1
         AND (last_fetched_at IS NULL OR (last_fetched_at + fetch_interval) < ?)`,
      )
      .all(now) as Record<string, unknown>[];

    if (dueFeeds.length === 0) return;

    log.info(`[RssFetcher] ${dueFeeds.length} feeds due for refresh`);

    const queue = [...dueFeeds];
    const running: Promise<void>[] = [];

    while (queue.length > 0 || running.length > 0) {
      while (queue.length > 0 && running.length < this.MAX_CONCURRENT) {
        const feed = queue.shift()!;
        const feedId = feed.id as number;
        if (this.fetchingFeeds.has(feedId)) continue;

        const p = this.fetchSingleFeed(feedId, feed.url as string).then(() => {
          const idx = running.indexOf(p);
          if (idx >= 0) running.splice(idx, 1);
        });
        running.push(p);
      }
      if (running.length > 0) {
        await Promise.race(running);
      }
    }
  }

  async refreshFeed(feedId: number): Promise<FetchResult> {
    const db = databaseModule.getCurrentDatabase();
    if (!db) return { feedId, newCount: 0, error: "No database" };

    const feed = db
      .prepare(`SELECT * FROM rss_feed WHERE id = ?`)
      .get(feedId) as Record<string, unknown> | undefined;
    if (!feed) return { feedId, newCount: 0, error: "Feed not found" };

    console.log("[RSS] manual refresh requested", {
      feedId,
      url: feed.url as string,
    });
    return this.fetchSingleFeed(feedId, feed.url as string);
  }

  async refreshAll(): Promise<FetchResult[]> {
    const db = databaseModule.getCurrentDatabase();
    if (!db) return [];

    const feeds = db
      .prepare(`SELECT * FROM rss_feed WHERE is_active = 1`)
      .all() as Record<string, unknown>[];

    const results: FetchResult[] = [];
    for (const feed of feeds) {
      const result = await this.fetchSingleFeed(
        feed.id as number,
        feed.url as string,
      );
      results.push(result);
    }
    return results;
  }

  private async fetchSingleFeed(
    feedId: number,
    url: string,
  ): Promise<FetchResult> {
    if (this.fetchingFeeds.has(feedId)) {
      return { feedId, newCount: 0 };
    }

    this.fetchingFeeds.add(feedId);
    const db = databaseModule.getCurrentDatabase();
    if (!db) {
      this.fetchingFeeds.delete(feedId);
      return { feedId, newCount: 0, error: "No database" };
    }

    try {
      console.log("[RSS] fetch start", { feedId, url });
      const localBilibiliFeed = parseLocalBilibiliFeedUrl(url);
      let parsedFeed;
      if (localBilibiliFeed) {
        parsedFeed = await fetchBilibiliFeed(url);
      } else {
        const xml = await fetchUrl(url);
        console.log("[RSS] fetch response received", {
          feedId,
          url,
          bytes: Buffer.byteLength(xml),
        });
        parsedFeed = parseFeedXml(xml);
      }

      console.log("[RSS] feed parsed", {
        feedId,
        url,
        title: parsedFeed.title,
        entries: parsedFeed.entries.length,
      });

      let newCount = 0;
      const now = Date.now();

      const upsertStmt = db.prepare(
        localBilibiliFeed
          ? `
            INSERT INTO rss_entry (
              create_time, update_time, feed_id, guid, title, url, author,
              description, content, published_at, media, categories,
              enclosure_url, enclosure_type, enclosure_length
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(feed_id, guid) DO UPDATE SET
              update_time = excluded.update_time,
              title = excluded.title,
              url = excluded.url,
              author = excluded.author,
              description = excluded.description,
              content = excluded.content,
              published_at = excluded.published_at,
              media = excluded.media,
              categories = excluded.categories,
              enclosure_url = excluded.enclosure_url,
              enclosure_type = excluded.enclosure_type,
              enclosure_length = excluded.enclosure_length
          `
          : `
            INSERT INTO rss_entry (
              create_time, update_time, feed_id, guid, title, url, author,
              description, content, published_at, media, categories,
              enclosure_url, enclosure_type, enclosure_length
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(feed_id, guid) DO NOTHING
          `,
      );

      let latestEntryAt: number | null = null;

      for (const entry of parsedFeed.entries) {
        const guid = entry.id || entry.link || entry.title || "";
        if (!guid) continue;

        const publishedAt = entry.published
          ? new Date(entry.published).getTime()
          : now;

        if (!latestEntryAt || publishedAt > latestEntryAt) {
          latestEntryAt = publishedAt;
        }

        const result = upsertStmt.run(
          now,
          now,
          feedId,
          guid,
          entry.title ?? null,
          entry.link ?? null,
          entry.creator,
          entry.description ?? null,
          entry.contentHtml,
          publishedAt,
          null,
          entry.categories.length > 0 ? JSON.stringify(entry.categories) : null,
          null,
          null,
          null,
        );

        if (result.changes > 0) {
          newCount++;
        }
      }

      db.prepare(
        `UPDATE rss_feed SET last_fetched_at = ?, last_entry_at = ?, error_count = 0, last_error = NULL, update_time = ? WHERE id = ?`,
      ).run(now, latestEntryAt, now, feedId);

      if (parsedFeed.title) {
        db.prepare(
          `UPDATE rss_feed SET title = CASE WHEN title = url THEN ? ELSE title END, description = ?, site_url = ?, image_url = ? WHERE id = ?`,
        ).run(
          parsedFeed.title,
          parsedFeed.description ?? null,
          parsedFeed.link ?? null,
          null,
          feedId,
        );
      }

      if (newCount > 0) {
        this.notifyRenderer("rss:entries-updated", { feedId, newCount });
      }

      log.info(
        `[RssFetcher] Feed ${feedId} refreshed: ${newCount} new entries`,
      );
      console.log("[RSS] fetch success", { feedId, url, newCount });
      return { feedId, newCount };
    } catch (error: any) {
      const errorMsg = error?.message || "Unknown error";
      log.error(`[RssFetcher] Feed ${feedId} failed: ${errorMsg}`);
      console.log("[RSS] fetch failed", { feedId, url, error: errorMsg });

      const now = Date.now();
      db.prepare(
        `UPDATE rss_feed SET error_count = error_count + 1, last_error = ?, update_time = ? WHERE id = ?`,
      ).run(errorMsg, now, feedId);

      return { feedId, newCount: 0, error: errorMsg };
    } finally {
      this.fetchingFeeds.delete(feedId);
    }
  }

  private notifyRenderer(channel: string, data: unknown): void {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, data);
      }
    }
  }
}

export default new RssFetcherModule();
