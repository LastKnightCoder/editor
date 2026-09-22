import { useMemo } from "react";
import { Editor } from "@tau/editor/src";
import type { ICard } from "@/types";
import ErrorBoundary from "@/components/ErrorBoundary";
import useDynamicExtensionsStore from "@/stores/useDynamicExtensionsStore";
import { cn } from "@tau/ui";

export function CardContentPreview({
  content,
  className,
}: {
  content: ICard["content"];
  className?: string;
}) {
  const extensions = useDynamicExtensionsStore(state => state.extensions);
  const preview = useMemo(() => content.slice(0, 3), [content]);
  // Editor 的 initValue 仅在挂载时生效，摘要实际变化时才重建只读实例。
  const revision = useMemo(() => JSON.stringify(preview), [preview]);

  return (
    <ErrorBoundary>
      <Editor
        key={revision}
        readonly
        initValue={preview.length ? preview : undefined}
        extensions={extensions}
        className={cn(
          "pointer-events-none overflow-hidden py-0.5 *:pointer-events-none",
          className
        )}
      />
    </ErrorBoundary>
  );
}
