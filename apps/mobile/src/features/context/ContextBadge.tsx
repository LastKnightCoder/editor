// 脉络入口：详情页元信息行下的「脉络 · N」卡片（关联数为 0 或加载失败时不渲染，对齐桌面
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
  const { context, loading } = useEntityContextQuery(kind, id, refreshKey, onError);
  const count = contextCount(context);

  if (loading) {
    return (
      <div className="bg-surface shadow-card mt-4 rounded-[18px] px-4">
        <div className="bg-input mt-3 h-4 w-2/5 animate-pulse rounded" />
      </div>
    );
  }
  if (!context || count === 0) {
    return null;
  }

  return (
    <>
      <div className="bg-surface shadow-card mt-4 rounded-[18px] px-4">
        <button
          type="button"
          className="border-line flex w-full items-center border-b py-3"
          onClick={() => setSheetOpen(true)}
        >
          <Waypoints size={13} className="text-ink-3" aria-hidden />
          <span className="text-ink-3 ml-2 text-[11px] font-bold tracking-[0.14em]">
            脉络 · {count}
          </span>
          <ChevronRight size={14} className="text-ink-3 ml-auto" />
        </button>
      </div>
      {sheetOpen ? (
        <ContextSheet open={sheetOpen} context={context} onClose={() => setSheetOpen(false)} />
      ) : null}
    </>
  );
}

export default ContextBadge;
