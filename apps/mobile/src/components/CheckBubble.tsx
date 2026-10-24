import { Check } from "lucide-react";

/** 列表单选的当前项标记：主题色圆底 + 反白对勾，行尾放置 */
export function CheckBubble() {
  return (
    <span
      role="img"
      aria-label="当前选中"
      className="check-pop bg-accent text-ink-inverse grid h-[21px] w-[21px] shrink-0 place-items-center rounded-full"
    >
      <Check size={13} strokeWidth={3.4} aria-hidden="true" />
    </span>
  );
}
