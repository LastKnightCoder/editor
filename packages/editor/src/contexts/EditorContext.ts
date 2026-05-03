import { createContext } from "react";

export interface EditorFeatures {
  /** 禁用 Header 折叠功能 */
  disableHeaderCollapse?: boolean;
}

export interface EditorContextValue {
  theme?: "light" | "dark";
  features?: EditorFeatures;
}

export const EditorContext = createContext<EditorContextValue>({
  theme: "light",
});
