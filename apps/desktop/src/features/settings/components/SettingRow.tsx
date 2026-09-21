/**
 * 设置行 —— 设置子页的标准行式（左侧标题+说明，右侧控件槽）。
 * 行间 hairline 分隔（line-2 半透明，末行无线），对齐 mockups/settings/ 方案 A 定稿。
 */

import type { ReactNode } from "react";

export function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="border-line-2 flex items-center gap-4 border-b py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="text-tau-body text-ink-1 font-medium leading-snug">{title}</div>
        {description && (
          <div className="text-tau-meta text-ink-3 mt-0.5 leading-normal">{description}</div>
        )}
      </div>
      {children && <div className="flex flex-none items-center gap-2">{children}</div>}
    </div>
  );
}
