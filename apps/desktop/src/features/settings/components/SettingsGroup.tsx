/**
 * 设置分组 —— 子页的块单元：面板外的组标题（中文 semibold + 说明上下排布）+ surface 面板
 * （Panel：surface + shadow-card，不描边，与发布页面板同语言）。面板内放 SettingRow 或自定义内容。
 * bare：无面板，只要组标题与留白（并排统计卡、提示注记等自带容器的内容）。
 */

import type { ReactNode } from "react";
import clsx from "clsx";
import { Panel } from "@tau/ui";

export function SettingsGroup({
  title,
  description,
  action,
  bare = false,
  className,
  children,
}: {
  title?: ReactNode;
  description?: ReactNode;
  /** 组标题行右侧的操作（如「添加模型」） */
  action?: ReactNode;
  bare?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={clsx("mb-7 last:mb-0", className)}>
      {(title || action) && (
        <div className="flex items-end gap-3 px-1 pb-2">
          <div className="min-w-0 flex-1">
            {title && <h3 className="text-tau-body-lg text-ink-1 font-semibold">{title}</h3>}
            {description && <p className="text-tau-meta text-ink-2">{description}</p>}
          </div>
          {action && <div className="flex flex-none items-center gap-1.5">{action}</div>}
        </div>
      )}
      {bare ? (
        children
      ) : (
        <Panel pad="none" className="rounded-[14px] p-1.5">
          {children}
        </Panel>
      )}
    </div>
  );
}

/** 分组下的轻注记（图标 + 说明），不进面板 */
export function SettingsNote({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="text-tau-meta text-ink-2 mb-7 flex items-center gap-2 px-1 last:mb-0">
      {icon && <span className="text-ink-3 flex-none">{icon}</span>}
      <span className="min-w-0">{children}</span>
    </div>
  );
}
