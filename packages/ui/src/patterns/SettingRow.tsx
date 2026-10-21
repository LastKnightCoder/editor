/**
 * 设置行 —— 设置分组面板内的标准行式（左侧标题+说明，右侧控件槽）。
 * 行高 ≥56px；同一面板内相邻行以 line-2 弱分隔（02 §2.3「列表行间」token，内收不贴面板边），
 * 分组之间靠 SettingsGroup 面板与留白区分。
 */

import type { ReactNode } from "react";
import clsx from "clsx";

/** 面板内相邻行的 line-2 弱分隔（内收 12px）：自定义行（模型 / 文件行）也挂它，与 SettingRow 互相衔接 */
export const ROW_DIVIDER =
  "relative [&+&]:before:border-line-2 [&+&]:before:absolute [&+&]:before:inset-x-3 [&+&]:before:top-0 [&+&]:before:border-t";

export function SettingRow({
  title,
  description,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "rounded-tau-sm flex min-h-14 items-center gap-4 px-3 py-[11px]",
        ROW_DIVIDER,
        className
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="text-tau-body-lg text-ink-1 font-medium leading-snug">{title}</div>
        {description && (
          <div className="text-tau-meta text-ink-2 mt-0.5 leading-normal">{description}</div>
        )}
      </div>
      {children && <div className="flex flex-none items-center gap-2">{children}</div>}
    </div>
  );
}
