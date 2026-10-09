/**
 * 详情页的「创作模式」开关：点一下进入左白板右写作，再点一下回到普通详情。
 */

import { PanelsLeftRight } from "lucide-react";
import { cn } from "@tau/ui";

export function ComposeModeToggle({
  active,
  onChange,
}: {
  active: boolean;
  onChange(active: boolean): void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => onChange(!active)}
      title={active ? "回到普通编辑" : "左边白板摆资料、打草稿，右边写"}
      className={cn(
        "text-tau-meta text-ink-2 hover:bg-hover hover:text-ink-1 inline-flex h-[22px] shrink-0 items-center gap-[5px] rounded-full px-2 transition-colors",
        active && "bg-accent-soft text-accent-text hover:bg-accent-soft hover:text-accent-text"
      )}
    >
      <PanelsLeftRight className="size-[13px]" strokeWidth={1.75} />
      {active ? "退出创作模式" : "创作模式"}
    </button>
  );
}
