import type { ReactNode } from "react";
import type { RenderElementProps } from "slate-react";

export * from "../types/index";

/** 元素组件的基础 props（迁移前的旧命名，等价于 api 的 ElementRenderProps） */
export interface IExtensionBaseProps<T> {
  attributes: RenderElementProps["attributes"];
  element: T;
  children: ReactNode;
}
