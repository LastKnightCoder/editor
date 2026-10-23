import { createContext, useContext } from "react";

/** 封面沉浸页（transparent 顶栏）标记：其内按钮随 --header-p 白/棕交叉过渡 */
export const CoverHeaderContext = createContext(false);

/** 是否位于封面沉浸页顶栏内（自定义顶栏按钮据此切换封面配色） */
export function useOnCoverHeader(): boolean {
  return useContext(CoverHeaderContext);
}
