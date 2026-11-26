import { createContext, useContext } from "react";
import type { QueryDefinition } from "@tau/shared/query-database";

/** 页面标题行留给查询状态与「查询」按钮的挂载点：undefined 表示没有标题行，控件就地渲染；null 表示挂载点尚未就绪 */
export const QueryHeaderSlotContext = createContext<HTMLElement | null | undefined>(undefined);
export const useQueryHeaderSlot = () => useContext(QueryHeaderSlotContext);

/** 新建后首次打开时的意图：展开源码，或带着一句话让 AI 编写 */
export interface QueryOpenIntent {
  assist?: string;
}
const intents = new Map<number, QueryOpenIntent>();

export function queueQueryOpenIntent(tableId: number, intent: QueryOpenIntent) {
  intents.set(tableId, intent);
}
export function takeQueryOpenIntent(tableId: number | undefined): QueryOpenIntent | undefined {
  if (tableId === undefined) return undefined;
  const intent = intents.get(tableId);
  intents.delete(tableId);
  return intent;
}

export const emptyQuery = (code = ""): QueryDefinition => ({
  version: 1,
  language: "dsl",
  code,
});
