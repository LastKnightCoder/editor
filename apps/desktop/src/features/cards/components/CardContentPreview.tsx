import { useMemo } from "react";
import { getContentKit } from "@/services/editorKit";
import { Editor } from "@tau/editor";
import type { ICard } from "@/types";
import { ErrorBoundary } from "@tau/ui";
import { cn } from "@tau/ui";

/**
 * 卡片正文只读渲染：卡面只取前 blocks 个块；预览弹窗 / 详情页在正文会话就绪前
 * 用它渲染全文占位（blocks = Infinity），转场不必等会话（D-106）。
 * 默认禁止指针事件（卡面点击穿透到整卡）；interactive 用于漫步这类独立阅读场景，
 * 恢复链接点击与内嵌交互组件的操作。
 */
export function CardContentPreview({
  content,
  blocks = 3,
  interactive = false,
  className,
}: {
  content: ICard["content"];
  blocks?: number;
  interactive?: boolean;
  className?: string;
}) {
  const preview = useMemo(() => content.slice(0, blocks), [content, blocks]);
  // Editor 的 initValue 仅在挂载时生效，摘要实际变化时才重建只读实例。
  const revision = useMemo(() => JSON.stringify(preview), [preview]);

  return (
    <ErrorBoundary>
      <Editor
        kit={getContentKit()}
        key={revision}
        readonly
        initValue={preview.length ? preview : undefined}
        className={cn(
          "overflow-hidden py-0.5",
          !interactive && "pointer-events-none *:pointer-events-none",
          className
        )}
      />
    </ErrorBoundary>
  );
}
