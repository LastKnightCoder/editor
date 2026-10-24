// 脉络入口：详情页元信息行末尾的「脉络 N」胶囊（关联数为 0、加载中或失败时不渲染，对齐桌面
// KL-015），点击弹出 SnapSheet 浮层。数据在挂载时查询（计数需要全量分区），浮层直接复用。

import { useState } from "react";
import { ChevronRight, Waypoints } from "lucide-react";
import { contextCount } from "./model";
import ContextSheet from "./ContextSheet";
import { useEntityContextQuery } from "./useEntityContext";

type ContextBadgeProps = {
  kind: string;
  id: number;
  /** 外部刷新信号（页面 onResume 等），变化时重查 */
  refreshKey?: number;
  onError?: (error: unknown, fallback: string) => void;
};

export function ContextBadge({ kind, id, refreshKey = 0, onError }: ContextBadgeProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const { context } = useEntityContextQuery(kind, id, refreshKey, onError);
  const count = contextCount(context);

  // 胶囊挂在元信息行末尾：首次加载不占位；返回刷新期间沿用上一次结果，不闪烁
  if (!context || count === 0) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        aria-label={`脉络 · ${count}`}
        className="bg-page text-ink-2 active:bg-press ml-auto inline-flex shrink-0 items-center gap-1 rounded-full py-[3px] pl-2.5 pr-2 text-[12px] font-semibold tabular-nums transition-colors"
        onClick={() => setSheetOpen(true)}
      >
        <Waypoints size={12} aria-hidden />
        脉络 {count}
        <ChevronRight size={12} aria-hidden />
      </button>
      {sheetOpen ? (
        <ContextSheet open={sheetOpen} context={context} onClose={() => setSheetOpen(false)} />
      ) : null}
    </>
  );
}

export default ContextBadge;
