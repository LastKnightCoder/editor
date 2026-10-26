/** 待办示意共用的小件：勾选圈与项目色点，按桌面端 features/todos/components/TodoBits.tsx 重建 */
import { Check } from "lucide-react";
import { cn } from "@tau/ui";

export function TodoCheck({
  checked,
  recurring = false,
  overdue = false,
  onToggle,
}: {
  checked: boolean;
  recurring?: boolean;
  overdue?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={recurring ? "今日打卡" : checked ? "标记未完成" : "完成"}
      onClick={event => {
        event.stopPropagation();
        onToggle();
      }}
      className={cn(
        "ease-tau-out relative grid size-[17px] shrink-0 cursor-pointer place-items-center rounded-full border-[1.5px] transition-[background-color,border-color,color] duration-150",
        "after:absolute after:-inset-[5px] after:content-['']",
        recurring && !checked && "border-dashed",
        checked
          ? recurring
            ? "border-ok bg-ok text-ink-inverse"
            : "border-accent bg-accent text-ink-inverse"
          : cn(
              "hover:border-accent hover:text-accent text-transparent",
              overdue ? "border-danger" : "border-ink-3"
            )
      )}
    >
      <Check className="size-[11px]" strokeWidth={3} />
    </button>
  );
}

export type GroupTone = "tag-1" | "tag-2" | "tag-3" | "tag-4" | "tag-5";

const DOT_CLASS: Record<GroupTone, string> = {
  "tag-1": "bg-tag-1",
  "tag-2": "bg-tag-2",
  "tag-3": "bg-tag-3",
  "tag-4": "bg-tag-4",
  "tag-5": "bg-tag-5",
};

export function GroupDot({ tone, className }: { tone: GroupTone; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("size-[7px] shrink-0 rounded-[2.5px]", DOT_CLASS[tone], className)}
    />
  );
}
