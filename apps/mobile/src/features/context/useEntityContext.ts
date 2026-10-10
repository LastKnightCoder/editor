// 脉络数据拉取与内联引用合并：分区数据来自 Rust entity_context_get（纯 SQL），
// 「连接」分区的内联部分在前端解析（@tau/shared/inline-refs，与桌面同一份代码），
// 解析出的目标经 entity_context_resolve_entities 批量补身份后合并，口径对齐桌面
// linksOf：显式在前、内联在后，排除自身与共用正文身份，上限 50 条。

import { useEffect, useState } from "react";
import { extractInlineRefs } from "@tau/shared/inline-refs";
import * as tauri from "../../services/tauri";
import type { ContextEntity, ContextLink, EntityContext } from "./types";

const LINKS_LIMIT = 50;

/** 合并显式连接与内联引用（resolved 与 collectInlineTargets 的输出一一对应，null 表示目标已删除） */
export function mergeInlineLinks(
  context: EntityContext,
  resolved: Array<ContextEntity | null>
): ContextLink[] {
  const seen = new Set<string>([`${context.selfEntity.kind}:${context.selfEntity.id}`]);
  for (const projection of context.projections) seen.add(`${projection.kind}:${projection.id}`);
  for (const link of context.links) seen.add(`${link.entity.kind}:${link.entity.id}`);
  const merged = [...context.links];
  for (const entity of resolved) {
    if (merged.length >= LINKS_LIMIT) break;
    if (!entity) continue;
    const key = `${entity.kind}:${entity.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({ entity, inlineOnly: true });
  }
  return merged.slice(0, LINKS_LIMIT);
}

/** 解析自身正文里的内联引用目标（去重、排除已有身份），供批量补身份 */
export function collectInlineTargets(context: EntityContext): Array<{ kind: string; id: number }> {
  const seen = new Set<string>([`${context.selfEntity.kind}:${context.selfEntity.id}`]);
  for (const projection of context.projections) seen.add(`${projection.kind}:${projection.id}`);
  for (const link of context.links) seen.add(`${link.entity.kind}:${link.entity.id}`);
  const targets: Array<{ kind: string; id: number }> = [];
  for (const source of context.inlineSources) {
    let document: unknown;
    try {
      document = JSON.parse(source);
    } catch {
      continue;
    }
    for (const reference of extractInlineRefs(document)) {
      const key = `${reference.dst.kind}:${reference.dst.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      targets.push({ kind: reference.dst.kind, id: reference.dst.id });
    }
  }
  return targets.slice(0, LINKS_LIMIT);
}

async function loadEntityContext(kind: string, id: number): Promise<EntityContext> {
  const context = await tauri.entityContextGet(kind, id);
  const targets = collectInlineTargets(context);
  if (targets.length === 0) return context;
  try {
    const resolved = await tauri.entityContextResolveEntities(targets);
    return { ...context, links: mergeInlineLinks(context, resolved) };
  } catch {
    // 内联补身份失败不阻塞分区展示，退回显式连接
    return context;
  }
}

/** 详情页加载即查（计数入口需要）；出错时置空，入口不渲染（对齐桌面 KL-015） */
export function useEntityContextQuery(
  kind: string,
  id: number,
  refreshKey: number,
  onError?: (error: unknown, fallback: string) => void
): { context: EntityContext | null; loading: boolean } {
  const [context, setContext] = useState<EntityContext | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadEntityContext(kind, id)
      .then(result => {
        if (!cancelled) setContext(result);
      })
      .catch(error => {
        if (!cancelled) {
          setContext(null);
          onError?.(error, "脉络加载失败");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // onError 经 ref 由调用方稳定，避免其引用变化触发重复拉取
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, id, refreshKey]);

  return { context, loading };
}
