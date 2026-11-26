/**
 * 文档卡的「相关」：放入面板的分组、长出相关的建议、素材架的分组共用一份。
 * 先显式连接与正文引用，再反链，最后语义相近；去重并写明原因。
 */

import { useQuery } from "@tanstack/react-query";
import type { DocumentElement } from "@tau/whiteboard";
import { getEntityContext, getEntityRelated } from "@/commands/entity-context";
import useSettingStore from "@/stores/useSettingStore";
import type { EntityKind } from "@/types";
import { toInsertTarget, type InsertTarget } from "./insert";
import { textEntityRef } from "./entityRef";

export type RelatedReasonKind = "linked" | "inline" | "backlink" | "similar";

// 建议插入会保存这些来源原因，保持原始数据值；界面读取 reasonKind。
const RAW_REASON: Record<RelatedReasonKind, string> = {
  linked: "已连接",
  inline: "正文引用",
  backlink: "引用了它",
  similar: "内容相近",
};

export interface RelatedItem extends InsertTarget {
  key: string;
  kind: EntityKind;
  /** 随建议插入保存的来源原因。 */
  reason: string;
  /** 界面原因标识，不写入白板节点。 */
  reasonKind: RelatedReasonKind;
  /** AI 一句话要点；没有时为空串 */
  summary: string;
}

const RELATED_LIMIT = 8;

export async function loadRelated(target: NonNullable<DocumentElement["entityRef"]>) {
  // PDF 不是正文实体，没有脉络
  const ref = textEntityRef(target);
  if (!ref) return [];
  const [context, related] = await Promise.all([
    getEntityContext(ref).catch(() => null),
    getEntityRelated(ref).catch(() => []),
  ]);
  const seen = new Set([`${ref.kind}:${ref.id}`]);
  const items: RelatedItem[] = [];
  const push = (
    entity: { ref: { kind: string; id: number }; title: string },
    reasonKind: RelatedReasonKind,
    summary = ""
  ) => {
    const kind = (
      entity.ref.kind === "project-item" ? "project_item" : entity.ref.kind
    ) as EntityKind;
    const target = toInsertTarget({ kind, id: entity.ref.id, title: entity.title });
    if (!target) return;
    const key = `${target.entityRef.kind}:${target.entityRef.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push({ ...target, key, kind, reason: RAW_REASON[reasonKind], reasonKind, summary });
  };
  context?.links.forEach(link => push(link.entity, link.inlineOnly ? "inline" : "linked"));
  context?.backlinks.forEach(link => push(link.source, "backlink"));
  related.forEach(item => push(item.entity, "similar", item.summary));
  return items.slice(0, RELATED_LIMIT);
}

/** 文档模式（协作白板）的卡只存稳定引用，没有本机身份，没有「相关」 */
export function useRelated(element: DocumentElement | null) {
  const database = useSettingStore(state => state.setting.database.active);
  const ref = element?.entityRef;
  return useQuery({
    queryKey: ["whiteboard-related", database, ref?.kind, ref?.id],
    queryFn: () => (ref ? loadRelated(ref) : []),
    enabled: !!ref,
    staleTime: 30_000,
  });
}
