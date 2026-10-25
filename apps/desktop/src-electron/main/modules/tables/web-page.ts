import Database from "better-sqlite3";
import {
  HIGHLIGHT_COLORS,
  type LibraryFeedParams,
  type LibraryList,
  type LibraryPagesParams,
  type LibrarySite,
  type LibrarySort,
  type WebPageSummary,
} from "@tau/shared/browser-companion";
import { WEB_EXCERPT_SOURCE, type Excerpt } from "@/entity/excerpt/types";
import ExcerptTable from "./excerpt";

interface PageRow {
  url: string;
  host: string;
  title: string;
  page_title: string;
  renamed: number;
  count: number;
  noted: number;
  last_time: number;
  [color: string]: string | number;
}

const hostOf = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
};

const likePattern = (query: string) => `%${query.replace(/[\\%_]/g, char => `\\${char}`)}%`;

/** 当前（未删除）的网页摘录 */
const activeExcerpt = (alias = "") =>
  `${alias}source_type = '${WEB_EXCERPT_SOURCE}' AND ${alias}is_deleted = 0`;

/** 列进伴读库的页面：还有标注，或用户起过名 */
const VISIBLE = `(p.custom_title IS NOT NULL OR s.count > 0)`;

const STATS = `SELECT source_key AS url, COUNT(*) AS count, SUM(note != '') AS noted,
    ${HIGHLIGHT_COLORS.map(color => `SUM(color = '${color}') AS ${color}`).join(", ")},
    MAX(COALESCE(source_time, create_time)) AS last_time
  FROM excerpt WHERE ${activeExcerpt()} GROUP BY source_key`;

const ORDER: Record<LibrarySort, string> = {
  recent: "last_time DESC, p.url",
  oldest: "last_time ASC, p.url",
  most: "count DESC, last_time DESC, p.url",
  title: "title COLLATE NOCASE, p.url",
};

const toSummary = (row: PageRow): WebPageSummary => ({
  url: row.url,
  host: row.host,
  title: row.title,
  pageTitle: row.page_title,
  renamed: row.renamed === 1,
  count: row.count,
  noted: row.noted,
  colors: Object.fromEntries(
    HIGHLIGHT_COLORS.filter(color => Number(row[color]) > 0).map(color => [
      color,
      Number(row[color]),
    ])
  ),
  lastTime: row.last_time,
});

/**
 * 网页（主库 web_page）：伴读库的页面索引与用户起的名。显示名 = COALESCE(custom_title, page_title)，
 * 并写进该页 excerpt.source_title，摘录的其余消费方（搜索、脉络、移动端）直接读到显示名。
 */
export default class WebPageTable {
  /** 记下网页上报的标题（空标题不覆盖已有的），返回该页显示名 */
  static touch(db: Database.Database, url: string, pageTitle: string): string {
    db.prepare(
      `INSERT INTO web_page (url, host, page_title, create_time, update_time) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(url) DO UPDATE SET update_time = excluded.update_time,
         page_title = CASE WHEN excluded.page_title = '' THEN web_page.page_title ELSE excluded.page_title END`
    ).run(url, hostOf(url), pageTitle, Date.now(), Date.now());
    return this.displayTitle(db, url) ?? pageTitle;
  }

  static displayTitle(db: Database.Database, url: string): string | null {
    const row = db
      .prepare(`SELECT COALESCE(custom_title, page_title) AS title FROM web_page WHERE url = ?`)
      .get(url) as { title: string } | undefined;
    return row?.title ?? null;
  }

  /** 改名；customTitle 为 null 即恢复网页标题。该页摘录的 source_title 同步为新的显示名 */
  static rename(db: Database.Database, url: string, customTitle: string | null): WebPageSummary {
    return db.transaction(() => {
      const now = Date.now();
      const changed = db
        .prepare(`UPDATE web_page SET custom_title = ?, update_time = ? WHERE url = ?`)
        .run(customTitle, now, url).changes;
      if (!changed) throw new Error("伴读库里没有这个页面");
      db.prepare(
        `UPDATE excerpt SET source_title = (SELECT COALESCE(custom_title, page_title) FROM web_page WHERE url = ?),
           update_time = ?
         WHERE source_type = ? AND source_key = ?
           AND source_title != (SELECT COALESCE(custom_title, page_title) FROM web_page WHERE url = ?)`
      ).run(url, now, WEB_EXCERPT_SOURCE, url, url);
      const page = this.getPage(db, url);
      if (!page) throw new Error("伴读库里没有这个页面");
      return page;
    })();
  }

  static getPage(db: Database.Database, url: string): WebPageSummary | null {
    const row = db.prepare(`${this.pageSelect()} WHERE p.url = ?`).get(url) as PageRow | undefined;
    return row ? toSummary(row) : null;
  }

  static listPages(db: Database.Database, params: LibraryPagesParams): LibraryList<WebPageSummary> {
    const where = [VISIBLE];
    const args: unknown[] = [];
    if (params.host) {
      where.push("p.host = ?");
      args.push(params.host);
    }
    if (params.url) {
      where.push("p.url = ?");
      args.push(params.url);
    }
    if (params.noted) where.push("s.noted > 0");
    if (params.query) {
      const pattern = likePattern(params.query);
      where.push(`(COALESCE(p.custom_title, p.page_title) LIKE ? ESCAPE '\\' OR p.url LIKE ? ESCAPE '\\'
        OR EXISTS (SELECT 1 FROM excerpt e WHERE e.source_key = p.url AND ${activeExcerpt("e.")}
          AND (e.quote LIKE ? ESCAPE '\\' OR e.note LIKE ? ESCAPE '\\')))`);
      args.push(pattern, pattern, pattern, pattern);
    }
    const filter = `WHERE ${where.join(" AND ")}`;
    const rows = db
      .prepare(`${this.pageSelect()} ${filter} ORDER BY ${ORDER[params.sort]} LIMIT ? OFFSET ?`)
      .all(...args, params.limit, params.offset) as PageRow[];
    const { total } = db
      .prepare(
        `SELECT COUNT(*) AS total FROM web_page p LEFT JOIN (${STATS}) s ON s.url = p.url ${filter}`
      )
      .get(...args) as { total: number };
    return { items: rows.map(toSummary), total };
  }

  static listSites(db: Database.Database): LibrarySite[] {
    return db
      .prepare(
        `SELECT p.host, COUNT(*) AS count FROM web_page p LEFT JOIN (${STATS}) s ON s.url = p.url
         WHERE ${VISIBLE} AND p.host != '' GROUP BY p.host ORDER BY count DESC, p.host`
      )
      .all() as LibrarySite[];
  }

  /** 跨页面平铺的网页摘录，按标注时间倒序 */
  static listFeed(
    db: Database.Database,
    params: Omit<LibraryFeedParams, "color"> & { color?: string }
  ): LibraryList<Excerpt> {
    const where = [activeExcerpt()];
    const args: unknown[] = [];
    if (params.color) {
      where.push("color = ?");
      args.push(params.color);
    }
    if (params.noted) where.push("note != ''");
    if (params.query) {
      const pattern = likePattern(params.query);
      where.push(
        `(quote LIKE ? ESCAPE '\\' OR note LIKE ? ESCAPE '\\' OR source_title LIKE ? ESCAPE '\\')`
      );
      args.push(pattern, pattern, pattern);
    }
    const filter = `WHERE ${where.join(" AND ")}`;
    const ids = db
      .prepare(
        `SELECT id FROM excerpt ${filter} ORDER BY COALESCE(source_time, create_time) DESC, id DESC LIMIT ? OFFSET ?`
      )
      .all(...args, params.limit, params.offset) as { id: number }[];
    const byId = new Map(
      ExcerptTable.getByIds(
        db,
        ids.map(row => row.id)
      ).map(row => [row.id, row])
    );
    const { total } = db
      .prepare(`SELECT COUNT(*) AS total FROM excerpt ${filter}`)
      .get(...args) as { total: number };
    return { items: ids.flatMap(({ id }) => byId.get(id) ?? []), total };
  }

  /** 存量网页摘录补页面行（标题取该页摘录的 source_title）；返回补了几页 */
  static backfill(db: Database.Database): number {
    const missing = db
      .prepare(
        `SELECT source_key AS url, MAX(source_title) AS title, MIN(create_time) AS created
         FROM excerpt WHERE source_type = ? AND source_key NOT IN (SELECT url FROM web_page)
         GROUP BY source_key`
      )
      .all(WEB_EXCERPT_SOURCE) as {
      url: string;
      title: string;
      created: number;
    }[];
    if (!missing.length) return 0;
    const insert = db.prepare(
      `INSERT INTO web_page (url, host, page_title, create_time, update_time) VALUES (?, ?, ?, ?, ?)`
    );
    db.transaction(() => {
      for (const page of missing)
        insert.run(page.url, hostOf(page.url), page.title, page.created, page.created);
    })();
    return missing.length;
  }

  private static pageSelect(): string {
    return `SELECT p.url, p.host, COALESCE(p.custom_title, p.page_title) AS title, p.page_title,
        p.custom_title IS NOT NULL AS renamed, COALESCE(s.count, 0) AS count, COALESCE(s.noted, 0) AS noted,
        ${HIGHLIGHT_COLORS.map(color => `COALESCE(s.${color}, 0) AS ${color}`).join(", ")},
        COALESCE(s.last_time, p.update_time) AS last_time
      FROM web_page p LEFT JOIN (${STATS}) s ON s.url = p.url`;
  }
}
