/**
 * 同一思路「写成卡片」（KL-069）：新建一张空卡片当这个思路的枢纽，和用到它的几处连起来——卡片端互相加双向链接，
 * 文章 / 项目文档 / 日记端记谱系 distilled_from（那篇 → 新卡）；正文留空，由用户自己写。标记随之记为已连接。
 *
 * 写到一半放弃（离开时正文仍为空）就撤回：解开链接、删掉谱系与卡片，标记回到未处理。
 */

import type Database from "better-sqlite3";
import { DEFAULT_CARD_CONTENT } from "@/constants/card";
import type { ICard } from "@/types";
import { isBlankCardContent } from "@/utils/card";
import CardTable from "./tables/card";
import EntityLineageTable from "./tables/entity-lineage";
import KnowledgeAiInsightsTable, { linkCardsMutually } from "./tables/knowledge-ai-insights";
import Operation from "./tables/operation";

export interface PatternCardResult {
  card: ICard;
  /** 链接有改动的其他卡片 */
  changed: number[];
}

export function createPatternCard(
  db: Database.Database,
  nodeId: number,
  markId: string
): PatternCardResult {
  return db.transaction(() => {
    const mark = KnowledgeAiInsightsTable.get(db, nodeId)?.result.marks.find(
      item => item.id === markId
    );
    if (!mark || mark.kind !== "pattern" || mark.status !== "open") {
      throw new Error("这一处已经处理过或已重新生成");
    }
    const created = CardTable.createCard(db, {
      content: DEFAULT_CARD_CONTENT,
      count: 0,
      tags: [],
      links: [],
      isTop: false,
    });
    const target = { kind: "card", id: created.id } as const;
    const changed = new Set<number>();
    for (const end of mark.ends) {
      if (end.ref.kind === "card") {
        linkCardsMutually(db, created.id, end.ref.id).forEach(id => changed.add(id));
      } else {
        EntityLineageTable.record(db, { src: end.ref, dst: target, relation: "distilled_from" });
      }
    }
    changed.delete(created.id);
    KnowledgeAiInsightsTable.setStatus(db, nodeId, markId, "linked");
    return { card: CardTable.getCardById(db, created.id) as ICard, changed: [...changed] };
  })();
}

/** 撤回还空着的卡片；已经写了内容或卡片不存在时不动，返回 null */
export function discardPatternCard(
  db: Database.Database,
  nodeId: number,
  markId: string,
  cardId: number,
  now = Date.now()
): PatternCardResult | null {
  return db.transaction(() => {
    const card = CardTable.getCardById(db, cardId) as ICard | null;
    if (!card || !isBlankCardContent(card.content)) return null;
    const read = db.prepare(`SELECT links FROM cards WHERE id = ?`);
    const write = db.prepare(`UPDATE cards SET links = ?, update_time = ? WHERE id = ?`);
    const changed: number[] = [];
    for (const other of card.links) {
      const row = read.get(other) as { links: string | null } | undefined;
      if (!row) continue;
      let links: number[];
      try {
        const parsed = JSON.parse(row.links || "[]");
        links = Array.isArray(parsed) ? parsed.map(Number) : [];
      } catch {
        continue;
      }
      if (!links.includes(cardId)) continue;
      write.run(JSON.stringify(links.filter(id => id !== cardId)), now, other);
      Operation.insertOperation(db, "card", "update", other, now);
      changed.push(other);
    }
    EntityLineageTable.removeToDst(db, { kind: "card", id: cardId }, "distilled_from");
    CardTable.deleteCard(db, cardId);
    KnowledgeAiInsightsTable.setStatus(db, nodeId, markId, "open");
    return { card, changed };
  })();
}
