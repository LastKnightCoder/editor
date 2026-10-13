/**
 * 岔路数据：给定当前漫步到的一条内容，取三路邻居（双链 / 语义相近 / 同标签）。
 * 三路并行、任意一路失败降级为空数组；trail 只在合并阶段用，不进 queryKey，
 * 避免漫步每走一步都重查。
 */

import { useQuery } from "@tanstack/react-query";
import { getEntityContext, getEntityRelated } from "@/commands/entity-context";
import { getRandomWalkSameTag } from "@/commands/random-walk";
import type { EntityRef } from "@/entity/ref";
import type { WalkItem, WalkNeighbor, WalkRef } from "@/types";
import { mergeWalkNeighbors } from "./neighbors";

const NEIGHBOR_STALE_MS = 5 * 60_000;

interface NeighborSources {
  links: WalkNeighbor[];
  semantic: WalkNeighbor[];
  tags: WalkNeighbor[];
}

const walkable = (kind: string) =>
  kind === "card" || kind === "article" || kind === "project-item" || kind === "diary-moment";

/** 双链：脉络「连接」（显式连接 ∪ 内联引用）+「反链」来源 */
async function fetchLinkNeighbors(ref: EntityRef): Promise<WalkNeighbor[]> {
  const context = await getEntityContext(ref);
  if (!context) return [];
  const entities = [
    ...context.links.map(link => link.entity),
    ...context.backlinks.map(backlink => backlink.source),
  ];
  return entities
    .filter(entity => walkable(entity.ref.kind))
    .map(entity => ({ ref: entity.ref, title: entity.title, relation: "link", sharedTag: null }));
}

/** 语义相近：脉络「相关」 */
async function fetchSemanticNeighbors(ref: EntityRef): Promise<WalkNeighbor[]> {
  const related = await getEntityRelated(ref);
  return related
    .filter(item => walkable(item.entity.ref.kind))
    .map(item => ({
      ref: item.entity.ref,
      title: item.entity.title,
      relation: "semantic",
      sharedTag: null,
    }));
}

async function fetchTagNeighbors(item: WalkItem): Promise<WalkNeighbor[]> {
  if (item.tags.length === 0) return [];
  return getRandomWalkSameTag({ ref: item.ref, tags: item.tags });
}

/** 岔路邻居：PDF 批注不在 EntityRef 体系内，entity-context 两路跳过、只走同标签 */
export function useWalkNeighbors(
  item: WalkItem | null,
  trail: WalkRef[]
): {
  neighbors: WalkNeighbor[];
  loading: boolean;
} {
  const ref = item?.ref ?? null;
  const query = useQuery({
    queryKey: ["walk", "neighbors", ref?.kind, ref?.id],
    enabled: ref != null,
    staleTime: NEIGHBOR_STALE_MS,
    queryFn: async (): Promise<NeighborSources> => {
      if (!item || !ref) return { links: [], semantic: [], tags: [] };
      const entityRef: EntityRef | null =
        ref.kind === "pdf-annotation" ? null : { kind: ref.kind, id: ref.id };
      const [links, semantic, tags] = await Promise.all([
        entityRef ? fetchLinkNeighbors(entityRef).catch(() => []) : [],
        entityRef ? fetchSemanticNeighbors(entityRef).catch(() => []) : [],
        fetchTagNeighbors(item).catch(() => []),
      ]);
      return { links, semantic, tags };
    },
    select: (sources: NeighborSources): WalkNeighbor[] =>
      ref == null ? [] : mergeWalkNeighbors({ self: ref, ...sources, exclude: trail }),
  });
  return {
    neighbors: query.data ?? [],
    loading: query.isPending,
  };
}
