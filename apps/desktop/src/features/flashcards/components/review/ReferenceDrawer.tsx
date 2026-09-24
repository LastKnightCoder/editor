import { useOverlayDismiss } from "@/page/PageProvider";
import type { FlashcardReference } from "@/types";
import { IconButton, cn, useEdgeFade } from "@tau/ui";
import { FileText, X } from "lucide-react";
import { useEffect, useState } from "react";
import { RichContent } from "../CardContent";

export function ReferenceDrawer({
  reference,
  onClose,
}: {
  reference: FlashcardReference | null;
  onClose(): void;
}) {
  const open = reference !== null;
  useOverlayDismiss(onClose, open);

  /* 关闭时保留最后一条内容做退场动画 */
  const [shown, setShown] = useState(reference);
  useEffect(() => {
    if (reference) setShown(reference);
  }, [reference]);
  const current = reference ?? shown;

  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  useEdgeFade(scrollEl);

  return (
    <aside
      aria-label="参考资料"
      aria-hidden={!open}
      inert={!open}
      className={cn(
        "bg-surface shadow-float ease-tau-out absolute bottom-3 right-3 top-3 z-10 flex w-[min(440px,calc(100%-24px))] flex-col rounded-[16px] outline outline-1 outline-[var(--tau-line-1)] transition-[transform,opacity] duration-[240ms]",
        // 收起位移 = right-3 的 12px：退场终点恰好贴容器右缘，不越界撑出滚动条
        open ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-3 opacity-0"
      )}
    >
      {current && (
        <>
          <div className="flex h-12 flex-none items-center gap-2 pl-5 pr-3">
            <FileText className="text-ink-3 size-[15px] flex-none" strokeWidth={1.75} />
            <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">
              {current.title || "未命名资料"}
            </span>
            <IconButton aria-label="关闭" title="关闭 (Esc)" className="size-7" onClick={onClose}>
              <X className="size-4" strokeWidth={1.75} />
            </IconButton>
          </div>
          <div
            ref={setScrollEl}
            className="edge-fade-scroll mb-3 mr-2 min-h-0 flex-1 overflow-y-auto pb-4 pl-5 pr-3 text-[14px] leading-[1.75]"
          >
            {current.content && <RichContent key={current.id} content={current.content.content} />}
          </div>
        </>
      )}
    </aside>
  );
}
