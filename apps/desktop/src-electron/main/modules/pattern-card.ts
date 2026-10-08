/**
 * 同一思路「写成卡片」（KL-069）：新建一张空卡片当这个思路的枢纽，和用到它的几处连起来——卡片端
 * 建正文显式连接，文章 / 项目文档 / 日记端记谱系 distilled_from（那篇 → 新卡）；正文留空，由用户自己写。
 * 标记随之记为已连接。
 *
 * 写到一半放弃（离开时正文仍为空）就撤回：删掉卡片（其正文的显式连接随引用归零一并释放）、
 * 谱系与卡片，标记回到未处理。
 */

import type Database from "better-sqlite3";
import { DEFAULT_CARD_CONTENT } from "@/constants/card";
import type { ICard } from "@/types";
import { isBlankCardContent } from "@/utils/card";
import CardTable from "./tables/card";
import EntityLineageTable from "./tables/entity-lineage";
import KnowledgeAiInsightsTable, { linkCardsMutually } from "./tables/knowledge-ai-insights";

export interface PatternCardResult {
  card: ICard;
  /** 是否建立了新的显式连接（卡片端）；谱系不在此列 */
  linked: boolean;
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
      isTop: false,
    });
    const target = { kind: "card", id: created.id } as const;
    let linked = false;
    for (const end of mark.ends) {
      if (end.ref.kind === "card") {
        if (linkCardsMutually(db, created.id, end.ref.id)) linked = true;
      } else {
        EntityLineageTable.record(db, { src: end.ref, dst: target, relation: "distilled_from" });
      }
    }
    KnowledgeAiInsightsTable.setStatus(db, nodeId, markId, "linked");
    return { card: CardTable.getCardById(db, created.id) as ICard, linked };
  })();
}

/** 撤回还空着的卡片；已经写了内容或卡片不存在时不动，返回 null */
export function discardPatternCard(
  db: Database.Database,
  nodeId: number,
  markId: string,
  cardId: number
): PatternCardResult | null {
  return db.transaction(() => {
    const card = CardTable.getCardById(db, cardId) as ICard | null;
    if (!card || !isBlankCardContent(card.content)) return null;
    // 卡片正文的显式连接随 deleteCard 的引用归零一并释放，无需手工清理
    EntityLineageTable.removeToDst(db, { kind: "card", id: cardId }, "distilled_from");
    CardTable.deleteCard(db, cardId);
    KnowledgeAiInsightsTable.setStatus(db, nodeId, markId, "open");
    return { card, linked: false };
  })();
}
