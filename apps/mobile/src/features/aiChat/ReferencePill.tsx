// 回答正文里的引用：带类型图标与标签色的小胶囊（日记紫、卡片绿、文章蓝……），点按交给宿主打开预览。
// 作为 MarkdownRenderer 的 span 覆盖，非引用的 span 原样渲染。

import { memo, type ReactNode } from "react";
import { cn } from "@tau/ui";
import { FALLBACK_REFERENCE_KIND, referenceKindOf } from "./referenceKinds";

type SpanProps = {
  className?: string;
  children?: ReactNode;
  "data-id"?: string;
  "data-type"?: string;
  "data-text"?: string;
};

export function createReferenceSpan(onOpen: (id: number, type: string, text: string) => void) {
  return memo(function ReferenceSpan({ className, children, ...props }: SpanProps) {
    if (className !== "document-reference")
      return (
        <span className={className} {...props}>
          {children}
        </span>
      );
    const type = props["data-type"] ?? "";
    const id = Number.parseInt(props["data-id"] ?? "0", 10);
    const text = props["data-text"] ?? "";
    const kind = referenceKindOf(type) ?? FALLBACK_REFERENCE_KIND;
    const Icon = kind.icon;
    return (
      <button
        type="button"
        aria-label={`${kind.label}：${text}`}
        onClick={() => onOpen(id, type, text)}
        className={cn(
          "mx-px inline-flex h-[22px] max-w-full items-center gap-[3px] rounded-[7px] pr-[7px] pl-[5px] align-[1px] text-[13px] leading-none font-medium transition-transform active:scale-95",
          kind.tone
        )}
      >
        <Icon size={12} className="shrink-0" aria-hidden="true" />
        <span className="truncate">{children}</span>
      </button>
    );
  });
}
