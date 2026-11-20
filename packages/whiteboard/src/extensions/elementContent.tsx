import { createContext, useContext, type ComponentType } from "react";
import type { BoardElement } from "../types";

/** 每种元素的渲染闭包提供内容，不存在按业务名称索引的宿主插槽；渲染闭包按需读取附加属性。 */
export const ElementContentContext = createContext<
  ComponentType<{ element: BoardElement; [key: string]: unknown }> | undefined
>(undefined);
export const useElementContent = () => useContext(ElementContentContext);
