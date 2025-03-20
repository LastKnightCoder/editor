import { createContext } from "react";
import { StoreApi } from "zustand";
import { createTableStore } from "./TableStore";

/**
 * 表格存储类型定义
 */
export type TableStoreType = ReturnType<typeof createTableStore>;

/**
 * 表格状态接口
 */
export type TableState = StoreApi<ReturnType<TableStoreType["getState"]>>;

/**
 * 表格上下文
 * 用于在组件树中共享表格状态
 */
export const TableContext = createContext<TableStoreType | null>(null);
