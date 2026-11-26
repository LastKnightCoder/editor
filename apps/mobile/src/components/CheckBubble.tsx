import { Check } from "lucide-react";
import { useCheckBubbleI18n } from "./CheckBubble.i18n";

/** 列表单选的当前项标记：主题色圆底 + 反白对勾，行尾放置 */
export function CheckBubble({ "aria-label": label }: { "aria-label"?: string }) {
  const { t } = useCheckBubbleI18n();
  return (
    <span
      role="img"
      aria-label={label ?? t("selected")}
      className="check-pop bg-accent text-ink-inverse grid h-[21px] w-[21px] shrink-0 place-items-center rounded-full"
    >
      <Check size={13} strokeWidth={3.4} aria-hidden="true" />
    </span>
  );
}
