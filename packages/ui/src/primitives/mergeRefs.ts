import type { Ref } from "react";

/**
 * ref 合并 —— 克隆注入触发器时的标准件：调用方已有的 ref（回调或对象两种形态）
 * 与组件内部的锚 ref 同时接收元素，谁都不被覆盖。Tooltip / Menu / Select / Popover 共用。
 */
export function mergeRefs<T>(...refs: Array<Ref<T> | undefined>): (el: T | null) => void {
  return el => {
    for (const ref of refs) {
      if (typeof ref === "function") ref(el);
      else if (ref && typeof ref === "object") (ref as { current: T | null }).current = el;
    }
  };
}
