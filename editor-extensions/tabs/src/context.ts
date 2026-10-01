import { createContext } from "react";

/** 当前激活 Tab 的 key，由 Tabs 容器提供，TabPane 据此决定是否渲染内容 */
export const TabsActiveContext = createContext<string>("");

/** Tab 标题拖拽排序的 react-dnd item 类型标识 */
export const TAB_REORDER_TYPE = "tabs-pane-reorder";

export const TabsDragScopeContext = createContext<object | null>(null);
