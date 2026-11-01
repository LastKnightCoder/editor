import { useMemo, useSyncExternalStore } from "react";
import { createServiceId } from "@tau/shared/service-contract";
import { useOptionalService } from "@tau/editor/api";
import { isHighlightStyle, type HighlightStyle } from "./types.ts";

/**
 * 可订阅的笔触来源：宿主设置能在运行时修改时用它，高亮随之重绘。
 * `get` 必须在值未变时返回同一个值（useSyncExternalStore 的约定）。
 */
export interface HighlightStyleSource {
  get: () => unknown;
  subscribe: (listener: () => void) => () => void;
}

/** 背景高亮笔触：固定值或可订阅来源；未注册时为平涂 */
export type HighlightStyleOption = HighlightStyle | HighlightStyleSource;

export const IHighlightStyle = createServiceId<HighlightStyleOption>("highlightStyle");

const noopSubscribe = () => () => {};

/** 读取当前编辑器作用域的笔触；未知值回落平涂 */
export function useHighlightStyle(): HighlightStyle {
  const option = useOptionalService(IHighlightStyle);
  const [subscribe, getSnapshot] = useMemo(() => {
    if (option && typeof option === "object") return [option.subscribe, option.get] as const;
    return [noopSubscribe, () => option] as const;
  }, [option]);
  const value = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return isHighlightStyle(value) ? value : "flat";
}
