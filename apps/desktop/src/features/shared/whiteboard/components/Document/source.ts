import { resolveWhiteboardEntity } from "@/commands/whiteboard-document";
/**
 * 文档卡的数据：按 entityRef 读出卡片 / 文章 / 项目文档 / 碎碎念的元信息与正文首屏。
 * 正文后续变化由 useContentDocument(contentId) 订阅，这里只负责身份、标题与封面这类元信息。
 */

import { useQuery } from "@tanstack/react-query";
import type { Descendant } from "slate";
import type { DocumentElement, DocumentKind } from "@tau/whiteboard";
import { getCardById } from "@/commands/card";
import { findOneArticle } from "@/commands/article";
import { getDiaryMoment } from "@/commands/diary";
import { getProjectById, getProjectItemById } from "@/commands/project";
import useSettingStore from "@/stores/useSettingStore";
import { cardTitle } from "@/utils/card-title";
import { normalizeDiaryDay } from "@/utils/diary-day";
import { getEditorText } from "@/utils/editor";

/** 碎碎念：所在那一天与发布时间、当天的天气心情（只取 emoji） */
export interface DiaryMoment {
  segmentId: number;
  /** YYYY-MM-DD，打开日记页定位用 */
  day: string;
  time: number;
  moods: string[];
}

export interface DocumentSource {
  kind: DocumentKind;
  id: number;
  contentId: number;
  /** 卡片与碎碎念没有标题，取 AI 标题或正文开头，只用于面包屑与元素树 */
  title: string;
  content: Descendant[];
  tags: string[];
  /** 文章封面图；空串表示用派生色兜底 */
  banner: string;
  /** 项目文档所属项目名 */
  projectName: string;
  moment?: DiaryMoment;
  updateTime: number;
}

export const DOCUMENT_KIND_LABEL: Record<DocumentKind, string> = {
  card: "卡片",
  article: "文章",
  "project-item": "项目文档",
  "diary-moment": "日记",
};

type DocumentTarget = Pick<DocumentElement, "entityRef" | "entity">;

async function loadDocument(
  target: DocumentTarget,
  database: string
): Promise<DocumentSource | null> {
  let ref = target.entityRef;
  if (target.entity) {
    if (!["card", "article", "project-item", "diary-moment"].includes(target.entity.kind))
      return null;
    const id = await resolveWhiteboardEntity(database, target.entity);
    if (id === null) return null;
    ref = { kind: target.entity.kind as DocumentKind, id };
  }
  if (!ref) return null;
  const value = await loadLocalDocument(ref);
  if (target.entity && (await resolveWhiteboardEntity(database, target.entity)) !== ref.id)
    return null;
  return value;
}
async function loadLocalDocument(
  ref: NonNullable<DocumentElement["entityRef"]>
): Promise<DocumentSource | null> {
  const base = { kind: ref.kind, id: ref.id, banner: "", projectName: "" };
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
        projectName: project?.title ?? "",
        updateTime: item.updateTime,
      };
    }
    case "diary-moment": {
      const segment = await getDiaryMoment(ref.id);
      if (!segment) return null;
      return {
        ...base,
        contentId: segment.contentId,
        title: getEditorText(segment.content, 20),
        content: segment.content,
        tags: segment.tags,
        moment: {
          segmentId: segment.id,
          day: normalizeDiaryDay(segment.entryDate, segment.createTime),
          time: segment.createTime,
          moods: [segment.weather, segment.mood].flatMap(item =>
            item?.type === "emoji" && item.value ? [item.value] : []
          ),
        },
        updateTime: segment.updateTime,
      };
    }
  }
}

export function useDocumentSource(target: DocumentTarget | null) {
  const database = useSettingStore(state => state.setting.database.active);
  const query = useQuery({
    queryKey: [
      "whiteboard-document",
      database,
      target?.entity ?? null,
      target?.entityRef?.kind,
      target?.entityRef?.id,
    ],
    queryFn: () => loadDocument(target!, database).catch(() => null),
    enabled: target !== null,
    refetchOnWindowFocus: true,
  });
  return {
    source: query.data ?? null,
    loading: query.isPending,
    missing: query.isSuccess && query.data === null,
  };
}
