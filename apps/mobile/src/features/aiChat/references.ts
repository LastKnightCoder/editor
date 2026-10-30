// 回答里的 :ref[文字]{id=ID type=类型}：id 是实体 id（卡片、文章、日记……），预览面板要的是正文 contentId，
// 这里按类型查一次只读 SQL 换成预览目标。日记按日给出时取当天第一段，标题用日期。

import * as tauri from "../../services/tauri";
import type { ContentLinkTarget } from "../cards/editorExtensions/contentLinkModel";

const LOOKUP: Record<string, { sql: string; kind: string }> = {
  card: {
    sql: "SELECT content_id AS contentId, '' AS title FROM cards WHERE id = :id",
    kind: "card",
  },
  article: {
    sql: "SELECT content_id AS contentId, title FROM articles WHERE id = :id",
    kind: "article",
  },
  "project-item": {
    sql: "SELECT content_id AS contentId, title FROM project_item WHERE id = :id",
    kind: "project-item",
  },
  "diary-daily": {
    sql:
      "SELECT COALESCE((SELECT s.content_id FROM diary_segments s WHERE s.diary_id = d.id " +
      "ORDER BY s.create_time, s.id LIMIT 1), d.content_id) AS contentId, d.date AS title " +
      "FROM diary_entries d WHERE d.id = :id",
    kind: "diary-moment",
  },
  "diary-moment": {
    sql: "SELECT content_id AS contentId, '' AS title FROM diary_segments WHERE id = :id",
    kind: "diary-moment",
  },
  "plugin-entity": {
    sql: "SELECT content_id AS contentId, title FROM plugin_entities WHERE id = :id",
    kind: "plugin-entity",
  },
};

const ALIASES: Record<string, string> = { project_item: "project-item", diary: "diary-daily" };

/** 解析失败（类型不认识、实体已删）返回 null，由调用方提示 */
export async function resolveChatReference(
  databaseName: string,
  id: number,
  type: string,
  text: string
): Promise<ContentLinkTarget | null> {
  const lookup = LOOKUP[ALIASES[type] ?? type];
  if (!lookup || !Number.isSafeInteger(id) || id <= 0) return null;
  const result = await tauri.aiSqlQuery(databaseName, { sql: lookup.sql, params: { id } });
  const row = result.rows[0] as { contentId?: unknown; title?: unknown } | undefined;
  const contentId = Number(row?.contentId);
  if (!row || !Number.isSafeInteger(contentId) || contentId <= 0) return null;
  return {
    contentId,
    contentType: lookup.kind,
    contentTitle: (typeof row.title === "string" && row.title) || text,
    // 日记片段在移动端没有独立承载页，预览即可，不给「打开」
    refId: lookup.kind === "diary-moment" ? -1 : id,
  };
}
