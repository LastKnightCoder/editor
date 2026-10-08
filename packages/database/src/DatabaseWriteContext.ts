import { createContext } from "react";
import type { RowData } from "./types";

/** 异步正文与卸载草稿仍经实例提交入口保存，避免父级订阅先退场后丢失写入。 */
export const DatabaseWriteContext = createContext<
  ((rowId: string, patch: Partial<RowData>) => void | Promise<void>) | null
>(null);
