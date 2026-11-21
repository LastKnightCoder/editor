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

export interface RelatedItem extends InsertTarget {
  key: string;
  kind: EntityKind;
  /** 为什么相关：「已连接」「正文引用」「引用了它」「内容相近」 */
  reason: string;
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
    reason: string,
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
    items.push({ ...target, key, kind, reason, summary });
  };
  context?.links.forEach(link => push(link.entity, link.inlineOnly ? "正文引用" : "已连接"));
  context?.backlinks.forEach(link => push(link.source, "引用了它"));
  related.forEach(item => push(item.entity, "内容相近", item.summary));
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
