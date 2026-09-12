// 引用计数式滚动锁：多个弹层（BottomSheet/PanContainer 等）叠加开闭时，
// 只有最后一个释放者才恢复 body/html 原始滚动样式，避免"各自保存-恢复"模式
// 在交叉关闭时互相覆盖导致页面永久锁死。
import { useEffect } from "react";

let lockCount = 0;
let savedBody: { overflow: string; overscrollBehavior: string } | null = null;
let savedHtml: { overflow: string; overscrollBehavior: string } | null = null;

export function acquireScrollLock() {
  lockCount += 1;
  if (lockCount > 1) return;
  const bodyStyle = document.body.style;
  const htmlStyle = document.documentElement.style;
  savedBody = {
    overflow: bodyStyle.overflow,
    overscrollBehavior: bodyStyle.overscrollBehavior,
  };
  savedHtml = {
    overflow: htmlStyle.overflow,
    overscrollBehavior: htmlStyle.overscrollBehavior,
  };
  bodyStyle.overflow = "hidden";
  bodyStyle.overscrollBehavior = "none";
  htmlStyle.overflow = "hidden";
  htmlStyle.overscrollBehavior = "none";
}

export function releaseScrollLock() {
  if (lockCount === 0) return;
  lockCount -= 1;
  if (lockCount > 0 || !savedBody || !savedHtml) return;
  const bodyStyle = document.body.style;
  const htmlStyle = document.documentElement.style;
  bodyStyle.overflow = savedBody.overflow;
  bodyStyle.overscrollBehavior = savedBody.overscrollBehavior;
  htmlStyle.overflow = savedHtml.overflow;
  htmlStyle.overscrollBehavior = savedHtml.overscrollBehavior;
  savedBody = null;
  savedHtml = null;
}

/** active 为 true 期间持有全局滚动锁，卸载或置 false 时释放 */
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    acquireScrollLock();
    return releaseScrollLock;
  }, [active]);
}
