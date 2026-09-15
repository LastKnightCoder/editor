/**
 * 图标按钮 —— 30px 方形无底幽灵按钮，hover 淡墨（A2 反馈语言）。
 * 尺寸/位置微调用 className 覆盖（如侧栏头 27px）。
 */

import clsx from "clsx";
import type { ComponentProps } from "react";

export function IconButton({ className, type = "button", ...props }: ComponentProps<"button">) {
  return (
    <button
      type={type}
      className={clsx(
        "rounded-tau-sm text-ink-2 grid size-[30px] place-items-center",
        "ease-tau-out transition-[background,color] duration-[160ms]",
        "enabled:hover:bg-hover enabled:hover:text-ink-1",
        "disabled:cursor-default disabled:opacity-35",
        className
      )}
      {...props}
    />
  );
}
