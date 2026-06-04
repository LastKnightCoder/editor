import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => "/tmp/tau-test"),
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
  ipcMain: {
    handle: vi.fn(),
  },
  net: {
    request: vi.fn(() => {
      throw new Error("net.request should not be called for blocked URLs");
    }),
  },
}));

import { safeFetchHtml } from "../safe-fetch";
import RssEntryTable from "../tables/rss-entry";
import ReadLaterTable from "../tables/read-later";
import { parseOpml } from "../rss-opml";

function createRssDb() {
  const entries: Record<string, unknown>[] = [];
  const subscriptions: Record<string, unknown>[] = [];
  let nextEntryId = 1;

  return {
    prepare(sql: string) {
      return {
        run(...args: unknown[]) {
          if (sql.includes("INSERT INTO rss_subscription")) {
            subscriptions.push({
              id: args[0],
              feed_id: args[3],
              title: args[4],
              category: args[5],
            });
            return { changes: 1, lastInsertRowid: args[0] };
          }
          if (sql.includes("INSERT INTO rss_feed")) {
            return { changes: 1, lastInsertRowid: args[0] };
          }
          if (sql.includes("INSERT INTO rss_entry")) {
            const [
              create_time,
              update_time,
              feed_id,
              guid,
              title,
              url,
              author,
              description,
              content,
              readability_content,
              published_at,
              media,
              categories,
              enclosure_url,
              enclosure_type,
              enclosure_length,
            ] = args;
            const existing = entries.find(
              (entry) => entry.feed_id === feed_id && entry.guid === guid,
            );
            if (existing && sql.includes("DO UPDATE")) {
              Object.assign(existing, {
                update_time,
                title,
                url,
                author,
                description,
                content,
                readability_content,
                published_at,
                media,
                categories,
                enclosure_url,
                enclosure_type,
                enclosure_length,
              });
              return { changes: 1, lastInsertRowid: 999 };
            }
            if (existing) {
              return { changes: 0, lastInsertRowid: existing.id };
            }
            const row = {
              id: nextEntryId++,
              create_time,
              update_time,
              feed_id,
              guid,
              title,
              url,
              author,
              description,
              content,
              readability_content,
              published_at,
              media,
              categories,
              enclosure_url,
              enclosure_type,
              enclosure_length,
              is_read: 0,
              is_starred: 0,
              is_deleted: 0,
            };
            entries.push(row);
            return { changes: 1, lastInsertRowid: row.id };
          }
          if (sql.includes("UPDATE rss_entry SET is_deleted = 1")) {
            const id = args[1];
            const entry = entries.find((item) => item.id === id);
            if (entry) {
              entry.is_deleted = 1;
              entry.update_time = args[0];
              return { changes: 1 };
            }
            return { changes: 0 };
          }
          throw new Error(`Unhandled run SQL: ${sql}`);
        },
        get(...args: unknown[]) {
          if (sql.includes("SELECT * FROM rss_entry WHERE id = ?")) {
            return entries.find((entry) => entry.id === args[0]);
          }
          if (
            sql.includes(
              "SELECT * FROM rss_entry WHERE feed_id = ? AND guid = ?",
            )
          ) {
            return entries.find(
              (entry) => entry.feed_id === args[0] && entry.guid === args[1],
            );
          }
          if (sql.includes("SELECT COUNT(*) AS count FROM rss_entry")) {
            return {
              count: entries.filter((entry) => entry.is_deleted !== 1).length,
            };
          }
          throw new Error(`Unhandled get SQL: ${sql}`);
        },
        all(...args: unknown[]) {
          if (sql.includes("JOIN rss_subscription")) {
            const category = args[0];
            const feedIds = subscriptions
              .filter((sub) => sub.category === category)
              .map((sub) => sub.feed_id);
            return entries
              .filter((entry) => entry.is_deleted !== 1)
              .filter((entry) => feedIds.includes(entry.feed_id))
              .sort(
                (a, b) =>
                  ((b.published_at as number | null) ?? 0) -
                  ((a.published_at as number | null) ?? 0),
              );
          }
          if (
            sql.includes("FROM rss_entry") &&
            sql.includes("ORDER BY published_at DESC")
          ) {
            return entries
              .filter((entry) => entry.is_deleted !== 1)
              .sort(
                (a, b) =>
                  ((b.published_at as number | null) ?? 0) -
                  ((a.published_at as number | null) ?? 0),
              );
          }
          throw new Error(`Unhandled all SQL: ${sql}`);
        },
      };
    },
  } as any;
}

function createReadLaterDb() {
  const items: Record<string, unknown>[] = [];
  let nextId = 1;

  return {
    prepare(sql: string) {
      return {
        run(...args: unknown[]) {
          if (sql.includes("INSERT INTO read_later")) {
            const [
              create_time,
              update_time,
              source_type,
              source_id,
              title,
              url,
              excerpt,
              content,
              tags,
            ] = args;
            const existing =
              source_type === "url" && url
                ? items.find(
                    (item) => item.source_type === "url" && item.url === url,
                  )
                : undefined;
            if (existing && sql.includes("ON CONFLICT")) {
              Object.assign(existing, {
                update_time,
                title,
                excerpt,
                content,
                tags,
              });
              return { changes: 1, lastInsertRowid: existing.id };
            }
            const row = {
              id: nextId++,
              create_time,
              update_time,
              source_type,
              source_id,
              title,
              url,
              excerpt,
              content,
              is_archived: 0,
              is_starred: 0,
              tags,
              reading_progress: 0,
            };
            items.push(row);
            return { changes: 1, lastInsertRowid: row.id };
          }
          if (sql.includes("UPDATE read_later")) {
            const [title, excerpt, content, tags, update_time, id] = args;
            const existing = items.find((item) => item.id === id);
            if (!existing) return { changes: 0, lastInsertRowid: 0 };
            Object.assign(existing, {
              title,
              excerpt,
              content,
              tags,
              update_time,
            });
            return { changes: 1, lastInsertRowid: id };
          }
          throw new Error(`Unhandled run SQL: ${sql}`);
        },
        get(...args: unknown[]) {
          if (sql.includes("SELECT * FROM read_later WHERE id = ?")) {
            return items.find((item) => item.id === args[0]);
          }
          if (
            sql.includes(
              "SELECT * FROM read_later WHERE source_type = 'url' AND url = ?",
            )
          ) {
            return items.find(
              (item) => item.source_type === "url" && item.url === args[0],
            );
          }
          if (sql.includes("SELECT COUNT(*) AS count FROM read_later")) {
            return { count: items.length };
          }
          throw new Error(`Unhandled get SQL: ${sql}`);
        },
      };
    },
  } as any;
}

describe("RSS review regressions", () => {
  it("应阻断 localhost 子域，避免主进程抓取本机服务", async () => {
    await expect(safeFetchHtml("http://dev.localhost/feed")).rejects.toThrow(
      "Blocked host",
    );
  });

  it("RSS entry upsert 冲突时应返回并更新同一条记录", () => {
    const db = createRssDb();
    const first = RssEntryTable.upsert(db, {
      feedId: 1,
      guid: "same",
      title: "旧标题",
      readabilityContent: "<p>旧正文</p>",
    });
    const second = RssEntryTable.upsert(db, {
      feedId: 1,
      guid: "same",
      title: "新标题",
      readabilityContent: "<p>新正文</p>",
    });

    expect(second?.id).toBe(first?.id);
    expect(second?.title).toBe("新标题");
    expect(second?.readabilityContent).toBe("<p>新正文</p>");
    expect(
      db.prepare("SELECT COUNT(*) AS count FROM rss_entry").get(),
    ).toMatchObject({
      count: 1,
    });
  });

  it("应支持跨订阅的全部列表和分类列表", () => {
    const db = createRssDb();
    db.prepare(
      "INSERT INTO rss_feed (id, create_time, update_time, title, url) VALUES (?, ?, ?, ?, ?)",
    ).run(1, 1, 1, "A", "https://a.example/feed.xml");
    db.prepare(
      "INSERT INTO rss_feed (id, create_time, update_time, title, url) VALUES (?, ?, ?, ?, ?)",
    ).run(2, 1, 1, "B", "https://b.example/feed.xml");
    db.prepare(
      "INSERT INTO rss_subscription (id, create_time, update_time, feed_id, title, category) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(1, 1, 1, 1, "A", "Tech");
    db.prepare(
      "INSERT INTO rss_subscription (id, create_time, update_time, feed_id, title, category) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(2, 1, 1, 2, "B", "Tech");
    db.prepare(
      "INSERT INTO rss_feed (id, create_time, update_time, title, url) VALUES (?, ?, ?, ?, ?)",
    ).run(3, 1, 1, "C", "https://c.example/feed.xml");
    db.prepare(
      "INSERT INTO rss_subscription (id, create_time, update_time, feed_id, title, category) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(3, 1, 1, 3, "C", "Life");
    RssEntryTable.create(db, {
      feedId: 1,
      guid: "a",
      title: "A",
      publishedAt: 100,
    });
    RssEntryTable.create(db, {
      feedId: 2,
      guid: "b",
      title: "B",
      publishedAt: 200,
    });
    const deletedEntry = RssEntryTable.create(db, {
      feedId: 3,
      guid: "c",
      title: "C",
      publishedAt: 300,
    });
    RssEntryTable.remove(db, deletedEntry.id);

    expect(RssEntryTable.listAll(db).map((entry) => entry.title)).toEqual([
      "B",
      "A",
    ]);
    expect(
      RssEntryTable.listByCategory(db, "Tech").map((entry) => entry.title),
    ).toEqual(["B", "A"]);
    expect(RssEntryTable.listByCategory(db, "Life")).toHaveLength(0);
    expect(RssEntryTable.countAll(db)).toBe(2);
  });

  it("稍后读 URL 类型应按 URL 去重并返回已有记录", () => {
    const db = createReadLaterDb();
    const first = ReadLaterTable.add(db, {
      sourceType: "url",
      title: "旧标题",
      url: "https://example.com/post",
    });
    const second = ReadLaterTable.add(db, {
      sourceType: "url",
      title: "新标题",
      url: "https://example.com/post",
    });

    expect(second.id).toBe(first.id);
    expect(second.title).toBe("新标题");
    expect(
      db.prepare("SELECT COUNT(*) AS count FROM read_later").get(),
    ).toMatchObject({
      count: 1,
    });
  });

  it("OPML 解析应处理 XML 转义和嵌套分类", () => {
    const outlines = parseOpml(`
      <opml version="2.0">
        <body>
          <outline text="Dev &amp; AI">
            <outline text="Tau" xmlUrl="https://example.com/feed?x=1&amp;y=2" htmlUrl="https://example.com/?q=a&amp;b=c" />
          </outline>
        </body>
      </opml>
    `);

    expect(outlines).toEqual([
      {
        title: "Tau",
        xmlUrl: "https://example.com/feed?x=1&y=2",
        htmlUrl: "https://example.com/?q=a&b=c",
        type: "rss",
        category: "Dev & AI",
      },
    ]);
  });
});
