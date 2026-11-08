import { useMemo } from "react";
import { getContentKit } from "@/services/editorKit";
import { Editor } from "@tau/editor";
import type { Descendant } from "slate";
import { ErrorBoundary } from "@tau/ui";
import { cn } from "@tau/ui";

/**
 * 正文快照预览：只渲染传入内容的前 blocks 个块，不建立正文会话或订阅。
 * 用于卡片墙等静态摘要；interactive 恢复链接与内嵌组件交互。
 */
export function ContentPreivew({
  content,
  blocks = 3,
  interactive = false,
  className,
}: {
  content: Descendant[];
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
