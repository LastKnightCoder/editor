/**
 * 插件详情 › 设置的卡片容器：详情页本身是一整张纸，卡片用细描边而不是阴影。
 * 结构为卡头（身份与状态）› 小节（细线分隔）› 卡脚（保存栏），插件声明的分组和宿主控件都渲染为小节。
 */

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Panel, cn } from "@tau/ui";

export function SettingsCard({
  header,
  footer,
  children,
}: {
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Panel variant="outline" pad="none" className="min-w-0">
      {header}
      {children}
      {footer && <div className="border-line-2 border-t px-[18px] py-2.5">{footer}</div>}
    </Panel>
  );
}

/** 卡头图标块：传 icon 画图标，传 letter 画账号首字 */
export function SettingsCardIcon({
  icon: Icon,
  letter,
  className,
}: {
  icon?: LucideIcon;
  letter?: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "bg-accent-soft text-accent-text text-tau-body grid size-8 flex-none place-items-center rounded-[10px] font-semibold",
        className
      )}
    >
      {Icon ? <Icon size={15} strokeWidth={1.8} /> : letter}
    </span>
  );
}

export function SettingsCardHeader({
  icon,
  title,
  status,
  description,
  actions,
}: {
  icon?: ReactNode;
  title: ReactNode;
  /** 标题右侧的状态签（如「使用中」） */
  status?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="border-line-2 flex items-center gap-3 border-b py-3 pr-3.5 pl-[18px]">
      {icon}
      <div className="min-w-0 flex-1">
        <div className="text-tau-body-lg text-ink-1 flex min-w-0 items-center gap-2 font-semibold">
          {title}
          {status}
        </div>
        {description && <p className="text-tau-meta text-ink-2 truncate">{description}</p>}
      </div>
      {actions && <div className="flex flex-none items-center gap-1.5">{actions}</div>}
    </div>
  );
}

/** 小节：相邻小节之间细线分隔；内容通常是 SettingRow（自带 px-3，与小节标题左缘对齐） */
export function SettingsCardSection({
  title,
  description,
  action,
  children,
}: {
  title?: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="border-line-2 px-1.5 pb-1.5 [&+&]:border-t">
      {title ? (
        <div className="flex min-h-8 flex-wrap items-center gap-x-2 px-3 pt-3">
          <h3 className="text-tau-body text-ink-1 font-semibold">{title}</h3>
          {description && <p className="text-tau-meta text-ink-3 min-w-0">{description}</p>}
          {action && <div className="ml-auto flex-none">{action}</div>}
        </div>
      ) : (
        <div className="pt-1.5" />
      )}
      {children}
    </section>
  );
}

/** 插件自绘设置组件的承载区：只给内边距，排版归组件 */
export function SettingsCardBody({ children }: { children: ReactNode }) {
  return <div className="text-tau-body text-ink-1 min-w-0 px-[18px] py-4">{children}</div>;
}
