import { fallbackCommandContext, type CommandContext } from "@tau/rpc";
import Database from "better-sqlite3";
import { asynchronousDatabaseCommand } from "../database-command";
import { assertContentIsLocal, findCollaborationBinding } from "../collaboration-guard";
import { canonicalContentTitle } from "../collaboration/content-sessions";
import {
  ICreateArticle,
  IUpdateArticle,
  IArticle,
  ArticlePageItem,
  ArticlePageSort,
  ArticleTagCount,
} from "@/types";
import Operation from "./operation";
import { getMarkdownText, mapContentSnapshots } from "../../services/content-conversion";
import { basename } from "node:path";
import FTSTable from "./fts";
import VecDocumentTable from "./vec-document";
import ContentTable from "./content";
import ProjectTable from "./project";

/** 分页排序白名单（拼进 ORDER BY，不接受任意字符串）；同值按更新时间兜底 */
const ARTICLE_PAGE_ORDER: Record<ArticlePageSort, string> = {
  updated: "a.update_time DESC",
  created: "a.create_time DESC",
  words: "COALESCE(ct.count, 0) DESC, a.update_time DESC",
};

/** 只认自有键：原型链上的键（constructor 等）与 IPC 尾部追加的命令上下文都回落到更新时间 */
function articlePageOrder(sort: unknown): string {
  return typeof sort === "string" && Object.hasOwn(ARTICLE_PAGE_ORDER, sort)
    ? ARTICLE_PAGE_ORDER[sort as ArticlePageSort]
    : ARTICLE_PAGE_ORDER.updated;
}

export default class ArticleTable {
  static getListenEvents() {
    return {
      "create-article": this.createArticle.bind(this),
      "create-article-from-project-item": this.createArticleFromProjectItem.bind(this),
      "update-article": this.updateArticle.bind(this),
      "delete-article": (db: Database.Database, articleId: number) =>
        this.deleteArticleById(db, articleId),
      "get-all-articles": this.getAllArticles.bind(this),
      "get-article-page": this.getArticlePage.bind(this),
      "get-article-tag-counts": this.getArticleTagCounts.bind(this),
      "get-article-by-id": this.getArticleById.bind(this),
      "attach-podcast-to-article": this.attachPodcast.bind(this),
      "detach-podcast-from-article": this.detachPodcast.bind(this),
      "update-article-is-top": this.updateArticleIsTop.bind(this),
      "update-article-banner-bg": this.updateArticleBannerBg.bind(this),
      "update-article-banner-position": this.updateArticleBannerPosition.bind(this),
      "get-articles-by-dates": this.getArticlesByDates.bind(this),
      "get-articles-by-date-range": this.getArticlesByDateRange.bind(this),
      "get-articles-content-by-ids": asynchronousDatabaseCommand(
        this.getArticlesContentByIds.bind(this)
      ),
      "is-content-is-article": this.isContentIsArticle.bind(this),
      "get-article-by-content-id": this.getArticleByContentId.bind(this),
      "build-article-from-content": this.buildArticleFromContent.bind(this),
    };
  }

  static parseArticle(article: any): IArticle {
    let content = [];
    let count = 0;

    // 直接使用JOIN查询结果中的内容
    if (article.content) {
      try {
        content = JSON.parse(article.content);
        count = article.count || 0;
      } catch (error) {
        console.error("Error parsing content:", error);
      }
    }

    // 使用文章和内容表中最大的更新时间
    const updateTime = article.content_update_time
      ? Math.max(article.update_time, article.content_update_time)
      : article.update_time;

    // 解析 podcast 数据
    let podcast = undefined;
    if (article.podcast_id && article.podcast_audio_url) {
      try {
        podcast = {
          id: article.podcast_id,
          name: article.podcast_name || undefined,
          audioUrl: article.podcast_audio_url,
          script: article.podcast_script || "",
          scriptLines: article.podcast_script_lines ? JSON.parse(article.podcast_script_lines) : [],
          duration: article.podcast_duration || 0,
          speakers: article.podcast_speakers ? JSON.parse(article.podcast_speakers) : [],
        };
      } catch (error) {
        console.error("Error parsing podcast data:", error);
      }
    }

    return {
      id: article.id,
      create_time: article.create_time,
      update_time: updateTime,
      tags: JSON.parse(article.tags),
      title: article.title,
      content: content,
      author: article.author || "",
      links: JSON.parse(article.links || "[]"),
      bannerBg: article.banner_bg || "",
      bannerPosition: article.banner_position || "center",
      isTop: article.is_top || false,
      isDelete: article.is_delete || false,
      count: count,
      contentId: article.content_id,
      podcastId: article.podcast_id || undefined,
      podcast,
    };
  }

  static getAllArticles(db: Database.Database) {
    // 按照创建时间倒序
    const stmt = db.prepare(`
      SELECT a.id, a.create_time, a.update_time, a.tags, a.title, a.author, a.links,
             a.banner_bg, a.banner_position, a.is_top, a.is_delete, a.content_id, a.podcast_id,
             c.content, c.count, c.update_time as content_update_time,
             p.name as podcast_name, p.audio_url as podcast_audio_url, p.script as podcast_script, p.script_lines as podcast_script_lines, p.duration as podcast_duration, p.speakers as podcast_speakers
      FROM articles a
      LEFT JOIN contents c ON a.content_id = c.id
      LEFT JOIN podcasts p ON a.podcast_id = p.id
      WHERE a.is_delete = 0 
      ORDER BY a.create_time DESC
    `);
    const articles = stmt.all();
    return articles.map(article => this.parseArticle(article));
  }

  static getArticleById(db: Database.Database, articleId: number | bigint): IArticle {
    const stmt = db.prepare(`
      SELECT a.id, a.create_time, a.update_time, a.tags, a.title, a.author, a.links,
             a.banner_bg, a.banner_position, a.is_top, a.is_delete, a.content_id, a.podcast_id,
             c.content, c.count, c.update_time as content_update_time,
             p.name as podcast_name, p.audio_url as podcast_audio_url, p.script as podcast_script, p.script_lines as podcast_script_lines, p.duration as podcast_duration, p.speakers as podcast_speakers
      FROM articles a
      LEFT JOIN contents c ON a.content_id = c.id
      LEFT JOIN podcasts p ON a.podcast_id = p.id
      WHERE a.id = ? AND a.is_delete = 0
    `);
    const article = stmt.get(articleId);
    return this.parseArticle(article);
  }

  static getArticleByIds(db: Database.Database, articleIds: number[]): IArticle[] {
    if (articleIds.length === 0) return [];

    const placeholders = articleIds.map(() => "?").join(",");
    const stmt = db.prepare(`
      SELECT a.id, a.create_time, a.update_time, a.tags, a.title, a.author, a.links,
             a.banner_bg, a.banner_position, a.is_top, a.is_delete, a.content_id, a.podcast_id,
             c.content, c.count, c.update_time as content_update_time,
             p.name as podcast_name, p.audio_url as podcast_audio_url, p.script as podcast_script, p.script_lines as podcast_script_lines, p.duration as podcast_duration, p.speakers as podcast_speakers
      FROM articles a
      LEFT JOIN contents c ON a.content_id = c.id
      LEFT JOIN podcasts p ON a.podcast_id = p.id
      WHERE a.id IN (${placeholders}) AND a.is_delete = 0
    `);
    const articles = stmt.all(articleIds);
    return articles.map(article => this.parseArticle(article));
  }

  static attachPodcast(
    db: Database.Database,
    articleId: number,
    podcastId: number
  ): IArticle | null {
    const stmt = db.prepare("UPDATE articles SET podcast_id = ?, update_time = ? WHERE id = ?");
    const now = Date.now();
    stmt.run(podcastId, now, articleId);
    Operation.insertOperation(db, "article", "update", articleId, now);
    return this.getArticleById(db, articleId);
  }

  static detachPodcast(db: Database.Database, articleId: number): IArticle | null {
    const stmt = db.prepare("UPDATE articles SET podcast_id = NULL, update_time = ? WHERE id = ?");
    const now = Date.now();
    stmt.run(now, articleId);
    Operation.insertOperation(db, "article", "update", articleId, now);
    return this.getArticleById(db, articleId);
  }

  static createArticle(db: Database.Database, article: ICreateArticle): IArticle {
    const { tags, title, content, bannerBg, bannerPosition, isDelete, isTop, count } = article;

    // 如果没有提供contentId，则创建content记录
    const contentId = ContentTable.createContent(db, {
      content: content,
      count: count,
    });

    // 创建article记录
    const stmt = db.prepare(
      "INSERT INTO articles (create_time, update_time, tags, title, content_id, banner_bg, banner_position, is_delete, is_top) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    const now = Date.now();
    const res = stmt.run(
      now,
      now,
      JSON.stringify(tags),
      title,
      contentId,
      bannerBg,
      bannerPosition || "center",
      Number(isDelete),
      Number(isTop)
    );
    const createdArticleId = res.lastInsertRowid;

    Operation.insertOperation(db, "article", "insert", createdArticleId, now);

    return this.getArticleById(db, createdArticleId);
  }

  static createArticleFromProjectItem(
    db: Database.Database,
    projectItemId: number
  ): IArticle | null {
    const projectItem = ProjectTable.getProjectItem(db, projectItemId);
    if (!projectItem) {
      return null;
    }
    const contentId = projectItem.contentId;
    const title = projectItem.title;

    ContentTable.incrementRefCount(db, contentId);

    const stmt = db.prepare(
      "INSERT INTO articles (create_time, update_time, tags, title, content_id, banner_bg, banner_position, is_delete, is_top) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    const now = Date.now();
    const res = stmt.run(now, now, JSON.stringify([]), title, contentId, "", "center", 0, 0);
    const createdArticleId = res.lastInsertRowid;

    Operation.insertOperation(db, "article", "insert", createdArticleId, now);

    return this.getArticleById(db, createdArticleId);
  }

  static updateArticle(
    db: Database.Database,
    article: IUpdateArticle,
    ctx: CommandContext = fallbackCommandContext
  ): IArticle {
    const { tags, title, id, bannerBg, bannerPosition, isTop, isDelete, contentId } = article;
    const now = Date.now();

    // 获取当前的article信息
    const currentArticle = this.getArticleById(db, id);
    const collaborative = findCollaborationBinding(db, currentArticle.contentId);
    if (collaborative && (isDelete || contentId !== currentArticle.contentId)) {
      assertContentIsLocal(db, currentArticle.contentId);
    }

    // 更新article记录
    const stmt = db.prepare(
      "UPDATE articles SET update_time = ?, tags = ?, title = ?, content_id = ?, banner_bg = ?, banner_position = ?, is_top = ?, is_delete = ? WHERE id = ?"
    );
    stmt.run(
      now,
      JSON.stringify(tags || currentArticle.tags),
      canonicalContentTitle(db, currentArticle.contentId) ?? title ?? currentArticle.title,
      contentId,
      bannerBg || currentArticle.bannerBg,
      bannerPosition || currentArticle.bannerPosition,
      Number(isTop ?? currentArticle.isTop),
      Number(isDelete ?? currentArticle.isDelete),
      id
    );

    Operation.insertOperation(db, "article", "update", id, now);

    ctx.broadcastOthers("article:updated", { databaseName: basename(db.name), articleId: id });

    return this.getArticleById(db, id);
  }

  /** deferContent：正文只延迟释放（7 天宽限内可恢复），供插件的可恢复删除使用 */
  static deleteArticleById(
    db: Database.Database,
    articleId: number,
    options: { deferContent?: boolean } = {}
  ): number {
    // 获取文章信息，以获取contentId
    const articleInfo = this.getArticleById(db, articleId);
    if (articleInfo) assertContentIsLocal(db, articleInfo.contentId);

    const stmt = db.prepare("DELETE FROM articles WHERE id = ?");
    const result = stmt.run(articleId);

    if (result.changes > 0) {
      FTSTable.removeIndexByIdAndType(db, articleId, "article");
      VecDocumentTable.removeIndexByIdAndType(db, articleId, "article");
      Operation.insertOperation(db, "article", "delete", articleId, Date.now());

      const projectItemStmt = db.prepare(
        "UPDATE project_item SET ref_type = '' WHERE ref_type = 'article' AND ref_id = ?"
      );
      projectItemStmt.run(articleId);

      if (articleInfo && articleInfo.contentId) {
        // 删除关联的content记录（减少引用计数）
        if (options.deferContent) ContentTable.releaseDeferred(db, articleInfo.contentId);
        else ContentTable.deleteContent(db, articleInfo.contentId);
      }
    }

    return result.changes;
  }

  static updateArticleIsTop(
    db: Database.Database,
    id: number,
    isTop: boolean,
    ctx: CommandContext = fallbackCommandContext
  ): IArticle {
    const stmt = db.prepare("UPDATE articles SET is_top = ? WHERE id = ?");
    stmt.run(Number(isTop), id);

    ctx.broadcastOthers("article:updated", { databaseName: basename(db.name), articleId: id });

    return this.getArticleById(db, id);
  }

  static updateArticleBannerBg(
    db: Database.Database,
    id: number,
    bannerBg: string,
    ctx: CommandContext = fallbackCommandContext
  ): IArticle {
    const stmt = db.prepare("UPDATE articles SET banner_bg = ? WHERE id = ?");
    stmt.run(bannerBg, id);

    ctx.broadcastOthers("article:updated", { databaseName: basename(db.name), articleId: id });

    return this.getArticleById(db, id);
  }

  static updateArticleBannerPosition(
    db: Database.Database,
    id: number,
    bannerPosition: string,
    ctx: CommandContext = fallbackCommandContext
  ): IArticle {
    const stmt = db.prepare("UPDATE articles SET banner_position = ? WHERE id = ?");
    stmt.run(bannerPosition, id);

    ctx.broadcastOthers("article:updated", { databaseName: basename(db.name), articleId: id });

    return this.getArticleById(db, id);
  }

  // 批量日期查询
  static getArticlesByDates(db: Database.Database, dates: string[]): Record<string, IArticle[]> {
    if (dates.length === 0) return {};

    const placeholders = dates.map(() => "?").join(",");
    const stmt = db.prepare(`
      SELECT a.id, a.title, a.author, a.create_time, a.update_time, a.tags, a.links,
             a.content_id, a.podcast_id, a.banner_bg, a.banner_position, a.is_top, a.is_delete,
             ct.content, ct.count,
             p.name as podcast_name, p.audio_url as podcast_audio_url, p.script as podcast_script, p.script_lines as podcast_script_lines, p.duration as podcast_duration, p.speakers as podcast_speakers
      FROM articles a
      LEFT JOIN contents ct ON a.content_id = ct.id
      LEFT JOIN podcasts p ON a.podcast_id = p.id
      WHERE a.is_delete = 0
      AND date(a.update_time/1000, 'unixepoch') IN (${placeholders})
      ORDER BY a.update_time DESC
    `);

    const articles = stmt.all(...dates).map(article => this.parseArticle(article));
    const result: Record<string, IArticle[]> = {};

    articles.forEach(article => {
      const date = new Date(article.update_time).toISOString().split("T")[0];
      if (!result[date]) {
        result[date] = [];
      }
      result[date].push(article);
    });

    return result;
  }

  // 日期范围查询
  static getArticlesByDateRange(
    db: Database.Database,
    startDate: string,
    endDate: string
  ): Record<string, IArticle[]> {
    const startTimestamp = new Date(startDate).getTime();
    const endTimestamp = new Date(endDate + " 23:59:59").getTime();

    const stmt = db.prepare(`
      SELECT a.id, a.title, a.author, a.create_time, a.update_time, a.tags, a.links,
             a.content_id, a.podcast_id, a.banner_bg, a.banner_position, a.is_top, a.is_delete,
             ct.content, ct.count,
             p.name as podcast_name, p.audio_url as podcast_audio_url, p.script as podcast_script, p.script_lines as podcast_script_lines, p.duration as podcast_duration, p.speakers as podcast_speakers
      FROM articles a
      LEFT JOIN contents ct ON a.content_id = ct.id
      LEFT JOIN podcasts p ON a.podcast_id = p.id
      WHERE a.is_delete = 0
      AND a.update_time >= ? AND a.update_time <= ?
      ORDER BY a.update_time DESC
    `);

    const articles = stmt
      .all(startTimestamp, endTimestamp)
      .map(article => this.parseArticle(article));
    const result: Record<string, IArticle[]> = {};

    articles.forEach(article => {
      const date = new Date(article.update_time).toISOString().split("T")[0];
      if (!result[date]) {
        result[date] = [];
      }
      result[date].push(article);
    });

    return result;
  }

  // 文章页轻量分页列表：不取正文全文（摘要由 contents.content 前缀在渲染端派生），
  // 排序 置顶优先 + sort（默认最近编辑），供月刊网格与列表的无限滚动窗口消费。
  // tag = 标签筛选（侧栏子项），query = 标题关键词（页内搜索框），两者可叠加
  static getArticlePage(
    db: Database.Database,
    offset: number,
    limit: number,
    tag?: string,
    query?: string,
    sort: ArticlePageSort = "updated"
  ): { items: ArticlePageItem[]; total: number; totalWords: number } {
    const conditions = ["a.is_delete = 0"];
    const params: string[] = [];
    // tags 为 JSON 文本列，元素必带引号；清洗通配符与引号防误配/注入
    if (tag) {
      conditions.push("a.tags LIKE ?");
      params.push(`%"${tag.replace(/[%_"\\]/g, "")}"%`);
    }
    // 标题关键词：转义 LIKE 通配符后按字面子串匹配
    const keyword = query?.trim();
    if (keyword) {
      conditions.push("a.title LIKE ? ESCAPE '\\'");
      params.push(`%${keyword.replace(/[%_\\]/g, ch => `\\${ch}`)}%`);
    }
    const where = `WHERE ${conditions.join(" AND ")}`;

    const agg = db
      .prepare(
        `SELECT COUNT(*) AS n, COALESCE(SUM(ct.count), 0) AS words
         FROM articles a
         LEFT JOIN contents ct ON a.content_id = ct.id
         ${where}`
      )
      .get(...params) as { n: number; words: number };

    const rows = db
      .prepare(
        `SELECT a.id, a.title, a.author, a.create_time, a.update_time, a.tags,
                a.banner_bg, a.banner_position, a.is_top,
                ct.count, substr(ct.content, 1, 1200) AS excerpt
         FROM articles a
         LEFT JOIN contents ct ON a.content_id = ct.id
         ${where}
         ORDER BY a.is_top DESC, ${articlePageOrder(sort)}, a.id DESC
         LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset) as Record<string, unknown>[];

    const items: ArticlePageItem[] = rows.map(row => ({
      id: row.id as number,
      title: (row.title as string) || "",
      author: (row.author as string) || "",
      createTime: row.create_time as number,
      updateTime: row.update_time as number,
      tags: ArticleTable.parseTags(row.tags),
      bannerBg: (row.banner_bg as string) || "",
      bannerPosition: (row.banner_position as string) || "center",
      isTop: Boolean(row.is_top),
      words: (row.count as number | null) ?? 0,
      excerpt: (row.excerpt as string) || "",
    }));
    return { items, total: agg.n, totalWords: agg.words };
  }

  // 标签聚合计数（文章页过滤 pills 数据源）
  static getArticleTagCounts(db: Database.Database): ArticleTagCount[] {
    const rows = db
      .prepare("SELECT tags FROM articles WHERE is_delete = 0 AND tags IS NOT NULL AND tags != ''")
      .all() as { tags: string }[];
    const counts = new Map<string, number>();
    for (const row of rows) {
      for (const tag of ArticleTable.parseTags(row.tags)) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  }

  private static parseTags(raw: unknown): string[] {
    try {
      const parsed = JSON.parse(String(raw ?? "[]"));
      return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === "string") : [];
    } catch {
      return [];
    }
  }

  // 根据 IDs 获取文章内容（转换为 Markdown）
  static async getArticlesContentByIds(
    db: Database.Database,
    ids: number[],
    maxLength?: number
  ): Promise<
    Array<{
      id: number;
      markdown: string;
      truncated: boolean;
      originalLength: number;
      metadata: Record<string, any>;
    }>
  > {
    if (ids.length === 0) return [];

    const articles = this.getArticleByIds(db, ids);

    return mapContentSnapshots(articles, async article => {
      const markdown = article.content ? await getMarkdownText(article.content) : "";
      const originalLength = markdown.length;

      let finalMarkdown = markdown;
      let truncated = false;

      if (maxLength && markdown.length > maxLength) {
        let truncatedMd = markdown.substring(0, maxLength);
        const breakPoints = ["\n\n", "\n", "。", "！", "？", ".", "!", "?"];
        let bestBreak = -1;

        for (const bp of breakPoints) {
          const idx = truncatedMd.lastIndexOf(bp);
          if (idx > maxLength * 0.8) {
            bestBreak = idx + bp.length;
            break;
          }
        }

        if (bestBreak > 0) {
          truncatedMd = truncatedMd.substring(0, bestBreak);
        }

        finalMarkdown = truncatedMd + "\n\n[内容已截断...]";
        truncated = true;
      }

      return {
        id: article.id,
        markdown: finalMarkdown,
        truncated,
        originalLength,
        metadata: {
          title: article.title,
          author: article.author,
          tags: article.tags,
          createTime: article.create_time,
          updateTime: article.update_time,
          wordCount: article.count,
        },
      };
    });
  }

  static isContentIsArticle(db: Database.Database, contentId: number): boolean {
    const stmt = db.prepare("SELECT id FROM articles WHERE content_id = ? AND is_delete = 0");
    const result = stmt.get(contentId);
    return !!result;
  }

  static getArticleByContentId(db: Database.Database, contentId: number): IArticle | null {
    const stmt = db.prepare("SELECT id FROM articles WHERE content_id = ? AND is_delete = 0");
    const result = stmt.get(contentId) as { id: number } | undefined;
    if (!result) {
      return null;
    }
    return this.getArticleById(db, result.id);
  }

  /** 用已有正文建文章（共用同一份正文）；这份正文已经是未删除的文章时返回那篇文章 */
  static buildArticleFromContent(
    db: Database.Database,
    contentId: number,
    title = "",
    tags: string[] = []
  ): IArticle {
    // 先检查是否已有文章
    const existingStmt = db.prepare(
      "SELECT id FROM articles WHERE content_id = ? AND is_delete = 0"
    );
    const existing = existingStmt.get(contentId) as { id: number } | undefined;
    if (existing) {
      return this.getArticleById(db, existing.id);
    }

    // 创建新文章，复用已有 contentId
    ContentTable.incrementRefCount(db, contentId);
    const stmt = db.prepare(
      "INSERT INTO articles (create_time, update_time, tags, title, content_id, banner_bg, banner_position, is_delete, is_top) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    const now = Date.now();
    const res = stmt.run(now, now, JSON.stringify(tags), title, contentId, "", "center", 0, 0);
    const articleId = res.lastInsertRowid;
    Operation.insertOperation(db, "article", "insert", articleId, now);
    return this.getArticleById(db, articleId);
  }
}
