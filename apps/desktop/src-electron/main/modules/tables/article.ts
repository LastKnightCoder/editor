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
  ArticleMetadataPatch,
  ArticleDatabaseScope,
} from "@/types";
import Operation from "./operation";
import { getMarkdownText, mapContentSnapshots } from "../../services/content-conversion";
import { basename } from "node:path";
import FTSTable from "./fts";
import VecDocumentTable from "./vec-document";
import ContentTable from "./content";
import ProjectTable from "./project";
import { ArticleContentOwnership } from "../content-ownership/article-content";
import type { SqliteRow } from "../../types/table";
import { countTags, removeTagFromList, renameTagInList, sameTags } from "@/utils/tags";

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
      "articles:patch-scoped": this.patchScopedArticle.bind(this),
      "create-article": this.createArticle.bind(this),
      "create-article-from-project-item": this.createArticleFromProjectItem.bind(this),
      "update-article": this.updateArticle.bind(this),
      "delete-article": (db: Database.Database, articleId: number) =>
        this.deleteArticleById(db, articleId),
      "get-all-articles": this.getAllArticles.bind(this),
      "get-article-page": this.getArticlePage.bind(this),
      "get-article-tag-counts": this.getArticleTagCounts.bind(this),
      "articles:rename-tag-scoped": this.renameScopedTag.bind(this),
      "articles:remove-tag-scoped": this.removeScopedTag.bind(this),
      "get-article-by-id": this.getArticleById.bind(this),
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
      "build-article-from-content": (db: Database.Database, contentId: number, title?: unknown) =>
        this.buildArticleFromContent(db, contentId, typeof title === "string" ? title : ""),
    };
  }

  static parseArticle(article: SqliteRow): IArticle {
    let content = [];
    let count = 0;

    // 直接使用JOIN查询结果中的内容
    if (article.content) {
      try {
        content = JSON.parse(article.content as string);
        count = (article.count as number) || 0;
      } catch (error) {
        console.error("Error parsing content:", error);
      }
    }

    // 使用文章和内容表中最大的更新时间
    const updateTime = article.content_update_time
      ? Math.max(article.update_time as number, article.content_update_time as number)
      : (article.update_time as number);

    return {
      id: article.id as number,
      create_time: article.create_time as number,
      update_time: updateTime,
      tags: JSON.parse(article.tags as string),
      title: article.title as string,
      content: content,
      author: (article.author as string | null) || "",
      links: JSON.parse((article.links as string | null) || "[]"),
      bannerBg: (article.banner_bg as string | null) || "",
      bannerPosition: (article.banner_position as string | null) || "center",
      isTop: Boolean(article.is_top),
      isDelete: Boolean(article.is_delete),
      count: count,
      contentId: article.content_id as number,
    };
  }

  static getAllArticles(db: Database.Database) {
    // 按照创建时间倒序
    const stmt = db.prepare(`
      SELECT a.id, a.create_time, a.update_time, a.tags, a.title, a.author, a.links,
             a.banner_bg, a.banner_position, a.is_top, a.is_delete, a.content_id,
             c.content, c.count, c.update_time as content_update_time
      FROM articles a
      LEFT JOIN content_snapshots c ON a.content_id = c.id
      WHERE a.is_delete = 0 
      ORDER BY a.create_time DESC
    `);
    const articles = stmt.all() as SqliteRow[];
    return articles.map(article => this.parseArticle(article));
  }

  static getArticleById(db: Database.Database, articleId: number | bigint): IArticle {
    const stmt = db.prepare(`
      SELECT a.id, a.create_time, a.update_time, a.tags, a.title, a.author, a.links,
             a.banner_bg, a.banner_position, a.is_top, a.is_delete, a.content_id,
             c.content, c.count, c.update_time as content_update_time
      FROM articles a
      LEFT JOIN content_snapshots c ON a.content_id = c.id
      WHERE a.id = ? AND a.is_delete = 0
    `);
    const article = stmt.get(articleId) as SqliteRow;
    return this.parseArticle(article);
  }

  static getArticleByIds(db: Database.Database, articleIds: number[]): IArticle[] {
    if (articleIds.length === 0) return [];

    const placeholders = articleIds.map(() => "?").join(",");
    const stmt = db.prepare(`
      SELECT a.id, a.create_time, a.update_time, a.tags, a.title, a.author, a.links,
             a.banner_bg, a.banner_position, a.is_top, a.is_delete, a.content_id,
             c.content, c.count, c.update_time as content_update_time
      FROM articles a
      LEFT JOIN content_snapshots c ON a.content_id = c.id
      WHERE a.id IN (${placeholders}) AND a.is_delete = 0
    `);
    const articles = stmt.all(articleIds) as SqliteRow[];
    return articles.map(article => this.parseArticle(article));
  }

  static createArticle(db: Database.Database, article: ICreateArticle): IArticle {
    return ContentTable.createOwnedContent(
      db,
      { content: article.content, contracts: article.contracts },
      contentId => this.insertArticleRow(db, contentId, article)
    );
  }

  private static insertArticleRow(
    db: Database.Database,
    contentId: number,
    {
      tags,
      title,
      bannerBg,
      bannerPosition,
      isDelete,
      isTop,
    }: Pick<ICreateArticle, "tags" | "title" | "bannerBg" | "bannerPosition" | "isDelete" | "isTop">
  ): IArticle {
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

  static patchScopedArticle(
    db: Database.Database,
    request: ArticleDatabaseScope & { id: number; patch: ArticleMetadataPatch },
    ctx: CommandContext = fallbackCommandContext
  ): IArticle {
    if (basename(db.name).replace(/\.db$/, "") !== request.databaseName.replace(/\.db$/, "")) {
      throw new Error("数据库已切换，请重新打开文章");
    }
    const current = db
      .prepare("SELECT is_top FROM articles WHERE id = ? AND is_delete = 0")
      .get(request.id) as { is_top: number } | undefined;
    if (!current) throw new Error("文章不存在或已删除");
    const { tags, isTop } = request.patch;
    if (tags === undefined) {
      if (isTop === undefined) throw new Error("请提供文章标签或置顶状态");
      return this.updateArticleIsTop(db, request.id, isTop, ctx);
    }
    const now = Date.now();
    db.prepare("UPDATE articles SET update_time = ?, tags = ?, is_top = ? WHERE id = ?").run(
      now,
      JSON.stringify(tags),
      Number(isTop ?? current.is_top),
      request.id
    );
    Operation.insertOperation(db, "article", "update", request.id, now);
    ctx.broadcastOthers("article:updated", {
      databaseName: basename(db.name),
      articleId: request.id,
    });
    return this.getArticleById(db, request.id);
  }

  static updateArticle(
    db: Database.Database,
    article: IUpdateArticle,
    ctx: CommandContext = fallbackCommandContext
  ): IArticle {
    return this.writeArticleMetadata(db, article, ctx);
  }

  static writeArticleMetadata(
    db: Database.Database,
    article: IUpdateArticle,
    ctx: CommandContext,
    plannedTitle?: string
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
      plannedTitle ??
        canonicalContentTitle(db, currentArticle.contentId) ??
        title ??
        currentArticle.title,
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
    return this.contentOwnership(db).deleteOwner(
      articleId,
      options.deferContent ? "deferred" : "immediate"
    );
  }

  private static removeArticleRow(db: Database.Database, articleId: number): number {
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
             a.content_id, a.banner_bg, a.banner_position, a.is_top, a.is_delete,
             ct.content, ct.count
      FROM articles a
      LEFT JOIN content_snapshots ct ON a.content_id = ct.id
      WHERE a.is_delete = 0
      AND date(a.update_time/1000, 'unixepoch') IN (${placeholders})
      ORDER BY a.update_time DESC
    `);

    const articles = (stmt.all(...dates) as SqliteRow[]).map(article => this.parseArticle(article));
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
             a.content_id, a.banner_bg, a.banner_position, a.is_top, a.is_delete,
             ct.content, ct.count
      FROM articles a
      LEFT JOIN content_snapshots ct ON a.content_id = ct.id
      WHERE a.is_delete = 0
      AND a.update_time >= ? AND a.update_time <= ?
      ORDER BY a.update_time DESC
    `);

    const articles = (stmt.all(startTimestamp, endTimestamp) as SqliteRow[]).map(article =>
      this.parseArticle(article)
    );
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
         LEFT JOIN content_snapshots ct ON a.content_id = ct.id
         ${where}`
      )
      .get(...params) as { n: number; words: number };

    const rows = db
      .prepare(
        `SELECT a.id, a.content_id, a.title, a.author, a.create_time, a.update_time, a.tags,
                a.banner_bg, a.banner_position, a.is_top,
                ct.count, substr(ct.content, 1, 1200) AS excerpt
         FROM articles a
         LEFT JOIN content_snapshots ct ON a.content_id = ct.id
         ${where}
         ORDER BY a.is_top DESC, ${articlePageOrder(sort)}, a.id DESC
         LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset) as Record<string, unknown>[];

    const items: ArticlePageItem[] = rows.map(row => ({
      contentId: row.content_id as number,
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
      .prepare(
        "SELECT tags, update_time FROM articles WHERE is_delete = 0 AND tags IS NOT NULL AND tags != ''"
      )
      .all() as { tags: string; update_time: number }[];
    return countTags(
      rows.map(row => ({ tags: ArticleTable.parseTags(row.tags), usedAt: row.update_time }))
    );
  }

  /** 标签改名；目标名已存在即合并。返回受影响的文章 */
  static renameScopedTag(
    db: Database.Database,
    request: ArticleDatabaseScope & { from: string; to: string },
    ctx: CommandContext = fallbackCommandContext
  ): IArticle[] {
    ArticleTable.assertScope(db, request);
    const to = request.to.trim();
    if (!to) throw new Error("标签名不能为空");
    return ArticleTable.rewriteTags(
      db,
      tags => renameTagInList(tags, request.from, to, { hierarchical: false }),
      ctx
    );
  }

  /** 从所有文章上摘掉标签，文章本身不动。返回受影响的文章 */
  static removeScopedTag(
    db: Database.Database,
    request: ArticleDatabaseScope & { tag: string },
    ctx: CommandContext = fallbackCommandContext
  ): IArticle[] {
    ArticleTable.assertScope(db, request);
    return ArticleTable.rewriteTags(
      db,
      tags => removeTagFromList(tags, request.tag, { hierarchical: false }),
      ctx
    );
  }

  private static assertScope(db: Database.Database, scope: ArticleDatabaseScope) {
    if (basename(db.name).replace(/\.db$/, "") !== scope.databaseName.replace(/\.db$/, "")) {
      throw new Error("数据库已切换，请重新打开文章");
    }
  }

  private static rewriteTags(
    db: Database.Database,
    rewrite: (tags: string[]) => string[],
    ctx: CommandContext
  ): IArticle[] {
    const rows = db.prepare("SELECT id, tags FROM articles WHERE is_delete = 0").all() as {
      id: number;
      tags: string;
    }[];
    const update = db.prepare("UPDATE articles SET update_time = ?, tags = ? WHERE id = ?");
    const changedIds = db.transaction(() => {
      const now = Date.now();
      const ids: number[] = [];
      for (const row of rows) {
        const tags = ArticleTable.parseTags(row.tags);
        const next = rewrite(tags);
        if (sameTags(tags, next)) continue;
        update.run(now, JSON.stringify(next), row.id);
        Operation.insertOperation(db, "article", "update", row.id, now);
        ids.push(row.id);
      }
      return ids;
    })();
    // 本窗口由调用方用返回值发总线事件，这里只通知其他窗口
    for (const articleId of changedIds) {
      ctx.broadcastOthers("article:updated", { databaseName: basename(db.name), articleId });
    }
    return changedIds.map(id => ArticleTable.getArticleById(db, id));
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
      metadata: Record<string, unknown>;
    }>
  > {
    if (ids.length === 0) return [];

    const articles = this.getArticleByIds(db, ids);

    return mapContentSnapshots(articles, async article => {
      const snapshot = ContentTable.getContentById(db, article.contentId);
      const markdown = snapshot ? await getMarkdownText(snapshot.content, snapshot.contracts) : "";
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
    return this.contentOwnership(db).createFromExisting(contentId, title, tags);
  }

  private static contentOwnership(db: Database.Database): ArticleContentOwnership {
    return new ArticleContentOwnership({
      transaction: apply => db.transaction(apply)(),
      findActiveOwner: contentId => this.getArticleByContentId(db, contentId),
      insertOwner: (contentId, title, tags) => this.insertSharedArticle(db, contentId, title, tags),
      readOwner: articleId => this.getArticleById(db, articleId),
      removeOwner: articleId => this.removeArticleRow(db, articleId),
      addReference: contentId => ContentTable.incrementRefCount(db, contentId),
      assertLocal: contentId => assertContentIsLocal(db, contentId),
      releaseReference: (contentId, mode) => {
        if (mode === "deferred") ContentTable.releaseDeferred(db, contentId);
        else ContentTable.deleteContent(db, contentId);
      },
    });
  }

  private static insertSharedArticle(
    db: Database.Database,
    contentId: number,
    title: string,
    tags: string[]
  ): IArticle {
    return this.insertArticleRow(db, contentId, {
      tags,
      title,
      bannerBg: "",
      bannerPosition: "center",
      isDelete: false,
      isTop: false,
    });
  }
}
