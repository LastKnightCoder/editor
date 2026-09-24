/**
 * 设置行 —— 设置分组面板内的标准行式（左侧标题+说明，右侧控件槽）。
 * 行高 ≥56px；同一面板内相邻行以 line-2 弱分隔（02 §2.3「列表行间」token，内收不贴面板边），
 * 分组之间靠 SettingsGroup 面板与留白区分（mockups/settings/index.html 第三版定稿）。
 */

import type { ReactNode } from "react";
import clsx from "clsx";
import { ROW_DIVIDER } from "./rowDivider";

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
