import type Database from "better-sqlite3";
import type { IndexType } from "@/types";
import type { ChatPromptIndexType } from "@/types/search";
import type { ContentSection } from "@/entity/sections";
import ContentTable from "./tables/content";

export interface IndexCandidate {
  id: number | string;
  type: IndexType | ChatPromptIndexType;
  updateTime: number;
  title?: string;
  read(
    sections?: boolean,
    signal?: AbortSignal
  ):
    | { raw: string; whole?: boolean; prefixTitle?: boolean }
    | { content: string; sections?: ContentSection[] }
    | Promise<{ content: string; sections?: ContentSection[] }>;
}

/** 只取身份与修订号；全文在确认需要更新后逐篇读取，不加载播客、连接数等展示数据。 */
export function* listContentIndexCandidates(db: Database.Database): Generator<IndexCandidate> {
  const sources = [
    { type: "card", table: "cards", title: "''", where: "", whole: true },
    { type: "article", table: "articles", title: "e.title", where: "AND e.is_delete = 0" },
    { type: "project-item", table: "project_item", title: "e.title", where: "" },
    { type: "diary-moment", table: "diary_segments", title: "''", where: "" },
    // 插件内容含已停用与宽限期内已卸载插件的，结果照常显示
    { type: "plugin-entity", table: "plugin_entities", title: "e.title", where: "" },
  ] as const;
  for (const source of sources) {
    // 不跨 await 持有 SQLite 游标，避免阻碍同连接上的正文写入。
    const rows = db
      .prepare(
        `
      SELECT e.id, e.content_id AS contentId, ${source.title} AS title,
             MAX(e.update_time, c.update_time) AS updateTime
      FROM ${source.table} e JOIN contents c ON c.id = e.content_id
      WHERE c.content IS NOT NULL ${source.where}
    `
      )
      .all() as Array<{ id: number; contentId: number; title: string; updateTime: number }>;
    for (const row of rows) {
      yield {
        id: row.id,
        type: source.type,
        title: row.title,
        updateTime: row.updateTime,
        read: (sections = true, signal) =>
          ContentTable.readText(
            db,
            row.contentId,
            row.title,
            source.type === "card",
            sections,
            signal
          ),
      };
    }
  }
}
