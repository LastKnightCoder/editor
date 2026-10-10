import { createContext, useContext, type ComponentType } from "react";

/** 每种元素的渲染闭包提供内容，不存在按业务名称索引的宿主插槽。 */
export const ElementContentContext = createContext<ComponentType<any> | undefined>(undefined);
export const useElementContent = () => useContext(ElementContentContext);
