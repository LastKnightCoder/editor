import type Database from "better-sqlite3";
import { clampText } from "@tau/shared/rich-text-text";
import { contentBlockLines } from "@/entity/text-digest";
import {
  CATALOG_SEARCH_TYPES,
  type CatalogSearchResult,
  type CatalogSearchType,
} from "@/types/search";
import type { EntityKind, FlashcardData } from "@/types";
import EntitySearchTable from "./entity-search";

interface SearchParams {
  types: CatalogSearchType[];
  keyword: string;
  limit?: number;
}

const ENTITY_KINDS: Partial<Record<CatalogSearchType, EntityKind>> = {
  todo: "todo",
  "calendar-event": "calendar-event",
  project: "project",
  whiteboard: "white_board",
  notebook: "notebook",
  pdf: "pdf",
};

export default class CatalogSearchTable {
  static getListenEvents() {
    return { "catalog:search": this.search.bind(this) };
  }

  static search(db: Database.Database, params: SearchParams): CatalogSearchResult[] {
    const keyword = params.keyword.trim();
    if (!keyword) return [];
    const limit = Math.min(Math.max(params.limit ?? 24, 1), 100);
    const results: CatalogSearchResult[] = [];
    for (const type of new Set(params.types)) {
      if (!CATALOG_SEARCH_TYPES.includes(type)) throw new Error("不支持的搜索类型");
      const kind = ENTITY_KINDS[type];
      if (kind) {
        results.push(
          ...EntitySearchTable.search(db, { kind, keyword, limit }).map(item => ({
            type,
            id: item.id,
            title: item.title,
            snippet: item.excerpt,
            meta: item.meta,
            updateTime: item.time,
          }))
        );
      } else if (type === "database") {
        const rows = db
          .prepare(`SELECT id, title, update_time AS updateTime FROM database_item
          WHERE archived = 0 AND instr(lower(title), lower(?)) > 0
          ORDER BY update_time DESC LIMIT ?`)
          .all(keyword, limit) as Array<{
          id: number;
          title: string;
          updateTime: number;
        }>;
        results.push(...rows.map(row => ({ ...row, type, snippet: "", meta: "" })));
      } else if (type === "chat-session") {
        results.push(...this.searchChats(db, keyword, limit));
      } else if (type === "flashcard") {
        results.push(...this.searchFlashcards(db, keyword, limit));
      }
    }
    return results.sort((a, b) => b.updateTime - a.updateTime).slice(0, limit);
  }

  private static searchChats(
    db: Database.Database,
    keyword: string,
    limit: number
  ): CatalogSearchResult[] {
    const rows = db
      .prepare(`SELECT s.id, s.title, s.scope, s.domain_ref, s.update_time
      FROM chat_session s WHERE s.archived = 0 AND instr(lower(s.title), lower(@keyword)) > 0
      AND (s.scope = 'main-chat'
        OR (s.scope = 'pdf-chat' AND EXISTS (SELECT 1 FROM pdfs p WHERE p.id = CAST(s.domain_ref AS INTEGER)))
        OR (s.scope = 'vibe-learning-chat' AND EXISTS (SELECT 1 FROM vibe_learning_project p WHERE p.id = CAST(s.domain_ref AS INTEGER))))
      ORDER BY s.update_time DESC LIMIT @limit`)
      .all({ keyword, limit }) as Array<{
      id: string;
      title: string;
      scope: NonNullable<CatalogSearchResult["chatScope"]>;
      domain_ref: string | null;
      update_time: number;
    }>;
    return rows.map(row => ({
      type: "chat-session",
      id: 0,
      sessionId: row.id,
      chatScope: row.scope,
      ...(row.domain_ref == null ? {} : { domainId: Number(row.domain_ref) }),
      title: row.title,
      snippet: "",
      meta:
        row.scope === "pdf-chat"
          ? "PDF 对话"
          : row.scope === "vibe-learning-chat"
            ? "Notebook 对话"
            : "AI 对话",
      updateTime: row.update_time,
    }));
  }

  private static searchFlashcards(
    db: Database.Database,
    keyword: string,
    limit: number
  ): CatalogSearchResult[] {
    const rows = db
      .prepare(`SELECT f.id,
      CASE WHEN json_valid(f.prompt) THEN f.prompt ELSE '[]' END AS prompt,
      CASE WHEN json_valid(f.detail) THEN f.detail ELSE '[]' END AS detail,
      CASE WHEN json_valid(f.data) THEN f.data ELSE '{}' END AS data,
      f.update_time, d.name
      FROM flashcards f JOIN flashcard_decks d ON d.id = f.deck_id
      WHERE instr(lower((SELECT group_concat(value, '') FROM json_tree(CASE WHEN json_valid(f.prompt) THEN f.prompt ELSE '[]' END) WHERE key = 'text' AND type = 'text')), lower(@keyword)) > 0
        OR instr(lower((SELECT group_concat(value, '') FROM json_tree(CASE WHEN json_valid(f.detail) THEN f.detail ELSE '[]' END) WHERE key = 'text' AND type = 'text')), lower(@keyword)) > 0
        OR EXISTS (SELECT 1 FROM json_tree(CASE WHEN json_valid(f.data) THEN f.data ELSE '{}' END) WHERE type = 'text' AND key != 'id' AND instr(lower(value), lower(@keyword)) > 0)
      ORDER BY f.update_time DESC LIMIT @limit`)
      .all({ keyword, limit }) as Array<{
      id: number;
      prompt: string;
      detail: string;
      data: string;
      update_time: number;
      name: string;
    }>;
    return rows.map(row => {
      const data = JSON.parse(row.data) as FlashcardData;
      return {
        type: "flashcard",
        id: row.id,
        title: clampText(contentBlockLines(JSON.parse(row.prompt)).join(" "), 100) || "未命名闪卡",
        snippet: clampText(
          [
            contentBlockLines(JSON.parse(row.detail)).join(" "),
            data.answer,
            data.explanation,
            ...(data.blanks?.map(blank => blank.answer) ?? []),
            ...(data.options?.filter(option => option.isCorrect).map(option => option.label) ?? []),
          ]
            .filter(Boolean)
            .join(" · "),
          160
        ),
        meta: row.name,
        updateTime: row.update_time,
      };
    });
  }
}
