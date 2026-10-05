import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { IconButton } from "@tau/ui";

/** 二级页顶栏：返回「本页」+ 标题 + 右侧操作 */
export function SubpageHeader({
  title,
  onBack,
  actions,
}: {
  title: ReactNode;
  onBack: () => void;
  actions?: ReactNode;
}) {
  return (
    <header className="border-line-1 flex h-12 shrink-0 items-center gap-1.5 border-b pl-2 pr-2.5">
      <IconButton aria-label="返回" title="返回" className="size-8" onClick={onBack}>
        <ArrowLeft size={16} strokeWidth={1.75} />
      </IconButton>
      <div className="text-tau-title text-ink-1 min-w-0 flex-1 truncate font-semibold">{title}</div>
      {actions}
    </header>
  );
}
