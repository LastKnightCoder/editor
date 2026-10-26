import {
  Ban,
  CircleAlert,
  CircleArrowUp,
  Puzzle,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@tau/ui";
import type { BoardElement } from "../types";

/** 占位原因：missing=完全未知类型；disabled=所属扩展被禁用；too-new/unsupported-version=元素版本与扩展定义不兼容；error=作者 render 抛错被 ErrorBoundary 兜底 */
export type UnknownElementReason =
  | "missing"
  | "too-new"
  | "unsupported-version"
  | "disabled"
  | "error";

interface PlaceholderLook {
  icon: LucideIcon;
  iconClass: string;
  title: string;
  description: string;
}

/** 五态占位文案与图标（视觉定稿，图标随原因区分，扩展 ID 不上屏） */
const REASON_LOOK: Record<UnknownElementReason, PlaceholderLook> = {
  missing: {
    icon: Puzzle,
    iconClass: "text-ink-3",
    title: "缺少扩展",
    description: "需要安装对应的扩展才能显示，数据已完整保留",
  },
  "too-new": {
    icon: CircleArrowUp,
    iconClass: "text-info",
    title: "需要更新扩展",
    description: "此元素由更新版本的扩展创建，数据已完整保留",
  },
  "unsupported-version": {
    icon: TriangleAlert,
    iconClass: "text-warn",
    title: "数据版本不匹配",
    description: "当前扩展不支持此数据版本，原始数据已保留",
  },
  disabled: {
    icon: Ban,
    iconClass: "text-ink-3",
    title: "扩展已停用",
    description: "所属扩展与其他扩展冲突，数据已完整保留",
  },
  error: {
    icon: CircleAlert,
    iconClass: "text-ink-3",
    title: "无法显示",
    description: "此元素渲染出错，数据已完整保留",
  },
};

export function UnknownElement({
  element,
  children,
  reason,
  extensionId,
}: {
  element: BoardElement;
  children?: React.ReactNode;
  reason?: UnknownElementReason;
  extensionId?: string;
}) {
  const look = REASON_LOOK[reason ?? "missing"];
  const Icon = look.icon;
  const valid = [element.x, element.y, element.width, element.height].every(Number.isFinite);
  // 尺寸分级按画布单位（与缩放无关）：小到只够放图标时收起文字，再宽才展示说明
  const iconOnly = element.width < 72 || element.height < 52;
  const showDescription = !iconOnly && element.width >= 140;
  return (
    <g
      data-unknown-element={element.id}
      data-unknown-reason={reason}
      data-unknown-extension={extensionId}
    >
      {valid && (
        <foreignObject
          x={element.x}
          y={element.y}
          width={Math.max(1, element.width)}
          height={Math.max(1, element.height)}
        >
          <div
            title={look.title}
            className="group/ph rounded-tau-sm border-ink-3/45 bg-surface/80 ease-tau-out hover:border-ink-3/80 relative size-full overflow-hidden border border-dashed bg-[repeating-linear-gradient(135deg,transparent_0_9px,color-mix(in_srgb,var(--tau-ink-3)_10%,transparent)_9px_10px)] transition-colors duration-[160ms]"
          >
            <div className="flex size-full flex-col items-center justify-center gap-0.5 px-2.5 py-2 text-center">
              <Icon
                className={cn("size-[18px] shrink-0", look.iconClass, !iconOnly && "mb-0.5")}
                strokeWidth={2}
                aria-hidden
              />
              {!iconOnly && (
                <div className="text-tau-sm text-ink-2 leading-[1.4] font-medium">{look.title}</div>
              )}
              {showDescription && (
                <div className="text-tau-micro text-ink-3 max-w-[26em] leading-[1.45]">
                  {look.description}
                </div>
              )}
            </div>
          </div>
        </foreignObject>
      )}
      {children}
    </g>
  );
}
