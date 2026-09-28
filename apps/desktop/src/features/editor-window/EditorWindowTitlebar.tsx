import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { AuxWindowTitlebar } from "@/app/AuxWindowTitlebar";

/** 编辑窗口标题栏：类型徽标 · 标题；右侧操作由调用方传入 */
export function EditorWindowTitlebar({
  icon: Icon,
  label,
  title,
  children,
}: {
  icon: LucideIcon;
  label: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <AuxWindowTitlebar
      leading={
        <>
          <span className="rounded-tau-sm bg-hover text-tau-micro text-ink-2 flex h-[22px] shrink-0 items-center gap-1 px-2">
            <Icon className="size-3" strokeWidth={1.75} />
            {label}
          </span>
          <span className="text-tau-meta text-ink-1 min-w-0 truncate font-medium">{title}</span>
        </>
      }
      actions={children}
    />
  );
}
