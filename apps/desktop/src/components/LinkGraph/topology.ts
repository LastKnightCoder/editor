import type { EdgeData, NodeData } from "@antv/g6";
import type { ICard } from "@/types";

export interface GraphTopology {
  nodes: NodeData[];
  edges: EdgeData[];
}

/** 只比较节点与有效连线，卡片顺序、正文及元数据不参与图的生命周期。 */
export function graphTopologyKey(cards: ICard[], getCardLinks: (card: ICard) => number[]): string {
  const ids = new Set(cards.map(card => card.id));
  const edges: EdgeData[] = [];
  const nodes = [...cards]
    .sort((a, b) => a.id - b.id)
    .map(card => {
      const links = [...new Set(getCardLinks(card))]
        .filter(id => ids.has(id))
        .sort((a, b) => a - b);
      for (const target of links) {
        edges.push({
          id: `${card.id}->${target}`,
          source: String(card.id),
          target: String(target),
        });
      }
      return { id: String(card.id), style: { size: Math.min(links.length * 10 + 30, 80) } };
    });
  return JSON.stringify({ nodes, edges } satisfies GraphTopology);
}
