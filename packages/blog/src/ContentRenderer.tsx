import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { DataResult } from "@tau/plugins/publish-data";
import type { Descendant } from "slate";
import { Editor, type EditorProps } from "@tau/editor";
import { prepareContent } from "./load";

export interface ContentRendererProps extends Pick<
  EditorProps,
  "kit" | "initValue" | "extensions" | "onInit" | "className" | "style"
> {
  content: DataResult;
  fallback?: ReactNode;
}

export function ContentRenderer({
  content,
  initValue,
  extensions,
  fallback = null,
  ...props
}: ContentRendererProps) {
  const [state, setState] = useState<
    | { content: DataResult; prepared: Awaited<ReturnType<typeof prepareContent>> }
    | { content: DataResult; error: unknown }
  >();
  useEffect(() => {
    const controller = new AbortController();
    prepareContent(content, controller.signal)
      .then(prepared => {
        if (!controller.signal.aborted) setState({ content, prepared });
      })
      .catch(error => {
        if (!controller.signal.aborted) setState({ content, error });
      });
    return () => controller.abort();
  }, [content]);
  const assembled = useMemo(
    () => [
      ...(state && "prepared" in state ? state.prepared.extensions : []),
      ...(extensions ?? []),
    ],
    [state, extensions]
  );
  if (!state || state.content !== content) return fallback;
  if ("error" in state) throw state.error;
  const nodes =
    initValue ?? ("content" in content.data.content ? content.data.content.content : []);
  return (
    <div data-tau-content={content.data.key}>
      {state.prepared.styles.map((css, index) => (
        <style key={index} data-tau-content-style>
          {css}
        </style>
      ))}
      <Editor
        {...props}
        key={content.dataUrl}
        initValue={nodes as Descendant[]}
        readonly
        inheritKit={false}
        extensions={assembled}
      />
    </div>
  );
}
