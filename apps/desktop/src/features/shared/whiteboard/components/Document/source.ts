/**
 * 文档卡的数据：按 entityRef 读出卡片 / 文章 / 项目文档的元信息与正文首屏。
 * 正文后续变化由 useContentDocument(contentId) 订阅，这里只负责身份、标题与封面这类元信息。
 */

import { useQuery } from "@tanstack/react-query";
import type { Descendant } from "slate";
import type { DocumentElement, DocumentKind } from "@tau/whiteboard";
import { getCardById } from "@/commands/card";
import { findOneArticle } from "@/commands/article";
import { getProjectById, getProjectItemById } from "@/commands/project";
import useSettingStore from "@/stores/useSettingStore";
import { cardTitle } from "@/utils/card-title";

export interface DocumentSource {
  kind: DocumentKind;
  id: number;
  contentId: number;
  /** 卡片没有标题，取 AI 标题或正文开头，只用于面包屑与元素树 */
  title: string;
  content: Descendant[];
  tags: string[];
  /** 文章封面图；空串表示用派生色兜底 */
  banner: string;
  /** 项目文档所属项目名 */
  projectName: string;
  updateTime: number;
}

export const DOCUMENT_KIND_LABEL: Record<DocumentKind, string> = {
  card: "卡片",
  article: "文章",
  "project-item": "项目文档",
};

async function loadDocument(ref: DocumentElement["entityRef"]): Promise<DocumentSource | null> {
  const base = { kind: ref.kind, id: ref.id };
  switch (ref.kind) {
    case "card": {
      const card = await getCardById(ref.id);
      if (!card) return null;
      return {
        ...base,
        contentId: card.contentId,
        title: cardTitle(card),
        content: card.content,
        tags: card.tags,
        banner: "",
        projectName: "",
        updateTime: card.update_time,
      };
    }
    case "article": {
      const article = await findOneArticle(ref.id);
      if (!article || article.isDelete) return null;
      return {
        ...base,
        contentId: article.contentId,
        title: article.title,
        content: article.content,
        tags: article.tags,
        banner: article.bannerBg,
        projectName: "",
        updateTime: article.update_time,
      };
    }
    case "project-item": {
      const item = await getProjectItemById(ref.id);
      if (!item) return null;
      const project = item.projects[0] ? await getProjectById(item.projects[0]) : null;
      return {
        ...base,
        contentId: item.contentId,
        title: item.title,
        content: item.content,
        tags: item.tags ?? [],
        banner: "",
        projectName: project?.title ?? "",
        updateTime: item.updateTime,
      };
    }
  }
}

export function useDocumentSource(ref: DocumentElement["entityRef"] | null) {
  const database = useSettingStore(state => state.setting.database.active);
  const query = useQuery({
    queryKey: ["whiteboard-document", database, ref?.kind, ref?.id],
    queryFn: () => loadDocument(ref!).catch(() => null),
    enabled: ref !== null,
    refetchOnWindowFocus: true,
  });
  return {
    source: query.data ?? null,
    loading: query.isPending,
    missing: query.isSuccess && query.data === null,
  };
}
