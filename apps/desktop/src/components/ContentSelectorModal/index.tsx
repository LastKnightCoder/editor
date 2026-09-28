/**
 * 选择内容弹窗：EntityPicker 的适配层，结果按全局搜索的 SearchResult 形状回传，
 * 供编辑器内容链接、数据库关联文档 / 卡片、白板插入卡片等沿用旧回调的调用方使用。
 * 空关键字按最近更新列出，无需调用方预灌列表。
 */

import React, { useMemo } from "react";
import { EntityPicker } from "@/components/EntityPicker";
import type { EntityCandidate, EntityKind } from "@/types/entity";
import type { SearchResult, IndexType } from "@/types/search";

export interface ContentSelectorModalProps {
  open: boolean;
  onCancel: () => void;
  onSelect: (items: SearchResult | SearchResult[]) => void;
  contentType: IndexType | IndexType[];
  multiple?: boolean;
  /** 按实体 id 排除（置灰「已关联」） */
  excludeIds?: number[];
  excludeContentIds?: number[];
  title?: string;
  subtitle?: string;
  /** 以下为旧 ContentSelector 的参数，EntityPicker 自带检索与空态，保留仅为兼容调用方 */
  extensions?: unknown[];
  emptyDescription?: string;
  showTitle?: boolean;
  initialContents?: SearchResult[];
}

const INDEX_TO_KIND: Record<IndexType, EntityKind> = {
  card: "card",
  article: "article",
  "project-item": "project_item",
  "diary-daily": "diary",
};

const KIND_TO_INDEX: Partial<Record<EntityKind, IndexType>> = {
  card: "card",
  article: "article",
  project_item: "project-item",
  diary: "diary-daily",
};

const toSearchResult = (candidate: EntityCandidate): SearchResult => ({
  id: candidate.id,
  contentId: candidate.contentId ?? 0,
  type: KIND_TO_INDEX[candidate.kind]!,
  title: candidate.title,
  source: "fts",
  updateTime: candidate.time,
  content: [],
});

const EMPTY_IDS: number[] = [];

const ContentSelectorModal: React.FC<ContentSelectorModalProps> = ({
  open,
  onCancel,
  onSelect,
  contentType,
  multiple = false,
  excludeIds = EMPTY_IDS,
  excludeContentIds = EMPTY_IDS,
  title = "选择内容",
  subtitle,
}) => {
  const kinds = useMemo(
    () => (Array.isArray(contentType) ? contentType : [contentType]).map(t => INDEX_TO_KIND[t]),
    [contentType]
  );

  return (
    <EntityPicker
      open={open}
      onClose={onCancel}
      title={title}
      subtitle={subtitle}
      kinds={kinds}
      multiple={multiple}
      confirmLabel="确定"
      isLinked={candidate =>
        excludeIds.includes(candidate.id) ||
        (candidate.contentId !== null && excludeContentIds.includes(candidate.contentId))
      }
      onConfirm={picked => {
        const results = picked.map(toSearchResult);
        onSelect(multiple ? results : results[0]);
      }}
    />
  );
};

export default ContentSelectorModal;
