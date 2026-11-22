import type Database from "better-sqlite3";
import { requireSourceDef } from "@/features/databases/data-sources";
import ArticleTable from "../tables/article";
import { prepareCanonicalContentTitle } from "../collaboration/content-sessions";
import type { DataSourceDefinition, SourceRow } from "./types";
import { dateValue, matchesTags, parseTags, selectExisting, sortedTags, tagPatch } from "./types";

const EMPTY_ARTICLE = [{ type: "paragraph", children: [{ type: "formatted", text: "" }] }];

interface ArticleRow {
  id: number;
  title: string;
  author: string | null;
  created: number;
  updated: number;
  tags: string | null;
  pinned: number;
  content_id: number | null;
  words: number;
}

const ARTICLE_SQL = `SELECT a.id, a.title, a.author, a.create_time AS created,
    MAX(a.update_time, IFNULL(ct.update_time, 0)) AS updated,
    a.tags, a.is_top AS pinned, a.content_id, IFNULL(ct.count, 0) AS words
  FROM articles a LEFT JOIN content_snapshots ct ON ct.id = a.content_id
  WHERE a.is_delete = 0
  ORDER BY a.create_time DESC, a.id DESC`;

function inScope(db: Database.Database, scope: Parameters<DataSourceDefinition["list"]>[1]) {
  return (db.prepare(ARTICLE_SQL).all() as ArticleRow[]).filter(row =>
    matchesTags(parseTags(row.tags), scope)
  );
}

export const articleSource: DataSourceDefinition = {
  def: requireSourceDef("article"),
  scopeOptions(db) {
    return {
      tags: sortedTags(
        db.prepare("SELECT tags FROM articles WHERE is_delete = 0").all() as { tags: string }[]
      ),
    };
  },
  ids: (db, scope) => inScope(db, scope).map(row => row.id),
  list(db, scope): SourceRow[] {
    return inScope(db, scope).map(row => ({
      id: row.id,
      contentId: row.content_id ?? undefined,
      values: {
        title: row.title,
        author: row.author ?? "",
        tags: parseTags(row.tags),
        pinned: Boolean(row.pinned),
        created: dateValue(row.created),
        updated: dateValue(row.updated),
        words: row.words,
      },
    }));
  },
  existing: (db, ids) => selectExisting(db, "articles", ids, " AND is_delete = 0"),
  write(db, id, patch, ctx) {
    const article = ArticleTable.getArticleById(db, id);
    if (!article) throw new Error("文章已不存在");
    const requested = "title" in patch ? String(patch.title ?? "").trim() : undefined;
    if (requested === "") throw new Error("文章标题不能为空");
    const title = prepareCanonicalContentTitle(db, article.contentId, requested);
    ArticleTable.writeArticleMetadata(
      db,
      {
        ...article,
        title: requested ?? article.title,
        tags: "tags" in patch ? tagPatch(patch.tags) : article.tags,
        isTop: "pinned" in patch ? Boolean(patch.pinned) : article.isTop,
      },
      ctx,
      title.title
    );
    return title.publish;
  },
  create(db, scope) {
    return ArticleTable.createArticle(db, {
      title: "未命名文章",
      author: "",
      tags: scope.tags ?? [],
      links: [],
      content: EMPTY_ARTICLE,
      bannerBg: "",
      bannerPosition: "center",
      isTop: false,
      isDelete: false,
      count: 0,
    } as Parameters<typeof ArticleTable.createArticle>[1]).id;
  },
  remove(db, id) {
    ArticleTable.deleteArticleById(db, id);
  },
};
