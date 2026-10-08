/**
 * 白板卡片元素升级为文档卡（D-122）：`{ type: "card", cardId }` → `{ type: "document", entityRef: { kind: "card", id } }`。
 * 开库时按实际数据判定（旧端写回会再转换），不改 update_time，单事务，失败抛错不放行（D-091 口径）。
 * 旧卡片的外观字段（variant / tone / 旧色值）随之丢弃：文档卡纸面统一 surface。
 * 全部设备升级后随下一次清洁版删除。
 */

import type Database from "better-sqlite3";
import ContentTable from "./tables/content";

const CARD_ONLY_KEYS = [
  "cardId",
  "maxWidth",
  "maxHeight",
  "resized",
  "readonly",
  "variant",
  "tone",
  "background",
  "topColor",
  "content",
  "contentId",
] as const;

interface Node {
  type?: unknown;
  children?: unknown;
  [key: string]: unknown;
}

/**
 * 原地改写一棵白板元素树里的卡片元素；返回被丢弃的 contentId（需释放引用计数，白板保存按 contentId 计数）
 * 与是否有改动。
 */
export function convertCardElements(nodes: unknown): {
  changed: boolean;
  releasedContentIds: number[];
} {
  const released: number[] = [];
  let changed = false;
  const visit = (value: unknown) => {
    if (!Array.isArray(value)) return;
    for (let index = 0; index < value.length; index++) {
      const node = value[index] as Node | null;
      if (!node || typeof node !== "object") continue;
      if (node.type === "card") {
        const next: Node = {
          ...node,
          type: "document",
          entityRef: { kind: "card", id: node.cardId },
        };
        for (const key of CARD_ONLY_KEYS) delete next[key];
        if (typeof node.contentId === "number" && node.contentId > 0) released.push(node.contentId);
        value[index] = next;
        changed = true;
        continue;
      }
      visit(node.children);
    }
  };
  visit(nodes);
  return { changed, releasedContentIds: released };
}

export function upgradeWhiteboardCardElements(db: Database.Database): number {
  const rows = db
    .prepare(`SELECT id, data FROM white_board_contents WHERE data LIKE '%"type":"card"%'`)
    .all() as Array<{ id: number; data: string | null }>;
  if (rows.length === 0) return 0;

  const update = db.prepare(`UPDATE white_board_contents SET data = ? WHERE id = ?`);
  let upgraded = 0;
  db.transaction(() => {
    for (const row of rows) {
      let data: { children?: unknown } | null;
      try {
        data = row.data ? JSON.parse(row.data) : null;
      } catch {
        // 已损坏的画布不归本次升级处理，保持原样
        continue;
      }
      if (!data) continue;
      const { changed, releasedContentIds } = convertCardElements(data.children);
      if (!changed) continue;
      update.run(JSON.stringify(data), row.id);
      for (const contentId of releasedContentIds) ContentTable.deleteContent(db, contentId);
      upgraded++;
    }
  })();
  return upgraded;
}
