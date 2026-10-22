/**
 * 洞见去掉「记为问题」（PS-046，81 裁决 27）：content_ai_insights / knowledge_ai_insights 结果里
 * 状态为 questioned 的标记与问句改为 dismissed（当时已记成问题，视为处理过）；知识洞见的标记同时记进
 * dismissed 身份，以后重新生成也不再出现。
 * 开库时按实际数据判定，不改 update_time，单事务，失败抛错不放行（D-091 口径）。全部设备升级后随下一次清洁版删除。
 */

import type Database from "better-sqlite3";
import { markKey } from "./tables/knowledge-ai-insights";
import type { KnowledgeMark } from "@/types/knowledge-insights";

const LEGACY_STATUS = "questioned";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** 原地改写一份结果；返回是否有改动 */
export function dismissQuestionedItems(
  result: Record<string, unknown>,
  knowledge: boolean
): boolean {
  let changed = false;
  const dismissed = new Set(Array.isArray(result.dismissed) ? result.dismissed.map(String) : []);
  for (const field of ["marks", "asks"] as const) {
    const items = result[field];
    if (!Array.isArray(items)) continue;
    result[field] = items.map((item: unknown) => {
      if (!isRecord(item) || item.status !== LEGACY_STATUS) return item;
      changed = true;
      if (knowledge && field === "marks" && Array.isArray(item.ends))
        dismissed.add(markKey(item as unknown as KnowledgeMark));
      return { ...item, status: "dismissed" };
    });
  }
  if (changed && knowledge) result.dismissed = [...dismissed];
  return changed;
}

export function upgradeQuestionedInsights(db: Database.Database): number {
  const tables = [
    { table: "content_ai_insights", key: "content_id", knowledge: false },
    { table: "knowledge_ai_insights", key: "id", knowledge: true },
  ] as const;
  let upgraded = 0;
  db.transaction(() => {
    for (const { table, key, knowledge } of tables) {
      const rows = db
        .prepare(`SELECT ${key} AS id, result FROM ${table} WHERE result LIKE '%"questioned"%'`)
        .all() as Array<{ id: number; result: string }>;
      const update = db.prepare(`UPDATE ${table} SET result = ? WHERE ${key} = ?`);
      for (const row of rows) {
        let result: unknown;
        try {
          result = JSON.parse(row.result);
        } catch {
          // 已损坏的结果不归本次升级处理，读取时按空结果
          continue;
        }
        if (!isRecord(result) || !dismissQuestionedItems(result, knowledge)) continue;
        update.run(JSON.stringify(result), row.id);
        upgraded++;
      }
    }
  })();
  return upgraded;
}
