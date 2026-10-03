import type Database from "better-sqlite3";
import type { Descendant } from "slate";
import type { MaterialInfo } from "@/entity/material";
import type { IndexType } from "@/types";
import { isMaterialIndexType, materialSearchDetails } from "./material-index";
import ArticleTable from "./tables/article";
import CardTable from "./tables/card";
import DiaryTable from "./tables/diary";
import ProjectTable from "./tables/project";

export interface SearchDetails {
  contentId: number;
  title: string;
  content: Descendant[];
  material?: MaterialInfo;
  [key: string]: unknown;
}

/**
 * 检索命中（type:id）→ 结果详情；实体已不存在时返回 null。向量、全文检索与全量列出共用，
 * 新增索引类型只改这里。
 */
export function searchResultDetails(
  db: Database.Database,
  type: IndexType,
  id: number
): SearchDetails | null {
  if (isMaterialIndexType(type)) return materialSearchDetails(db, type, id);
  switch (type) {
    case "card": {
      const card = CardTable.getCardById(db, id);
      return card
        ? {
            ...card,
            // 卡片没有标题列：有 AI 标题（详情查询已 LEFT JOIN 元信息）时作标题，否则留空由展示端取正文开头
            title: card.aiTitle ?? "",
            content: card.content || [],
          }
        : null;
    }
    case "article": {
      const article = ArticleTable.getArticleById(db, id);
      return article
        ? { ...article, title: article.title || "", content: article.content || [] }
        : null;
    }
    case "project-item": {
      const item = ProjectTable.getProjectItem(db, id);
      return item ? { ...item, title: item.title || "", content: item.content || [] } : null;
    }
    case "diary-daily": {
      const entry = DiaryTable.getDiaryEntryById(db, id);
      return entry
        ? {
            ...entry,
            contentId: entry.segments[0]?.contentId ?? 0,
            title: DiaryTable.getDiarySearchTitle(entry),
            content: entry.content || [],
          }
        : null;
    }
    default:
      return null;
  }
}
