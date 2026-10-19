import { useEffect, useMemo, useState } from "react";
import type { DataResult } from "@tau/plugins/publish-data";
import type { Descendant } from "slate";
import { Editor, type EditorProps } from "../Editor";
import { prepareContent } from "./load";
import { scopeContentCss } from "./content-css";
import { EditorKitScope } from "../core/kit/context";

export interface ContentRendererProps extends Omit<
  EditorProps,
  "readonly" | "document" | "onChange"
> {
  content: DataResult;
}

export function ContentRenderer({
  content,
  initValue,
  extensions,
  ...props
}: ContentRendererProps) {
  const [state, setState] = useState<{
    content: DataResult;
    scope: string;
    prepared: Awaited<ReturnType<typeof prepareContent>>;
  }>();
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const scope = crypto.randomUUID();
    setError("");
    setState(undefined);
    prepareContent(content, controller.signal)
      .then(prepared => {
        if (!controller.signal.aborted) setState({ content, scope, prepared });
      })
      .catch(error => {
        if (!controller.signal.aborted) setError(String(error));
      });
    return () => controller.abort();
  }, [content]);
  const css = useMemo(
    () => (state ? scopeContentCss(state.prepared.css, `[data-tau-content="${state.scope}"]`) : ""),
    [state]
  );
  const assembled = useMemo(
    () => [...(state?.prepared.extensions ?? []), ...(extensions ?? [])],
    [state, extensions]
  );
  if (error) return <p role="alert">{error}</p>;
  if (!state || state.content !== content) return <p role="status">正在准备正文…</p>;
  const nodes =
    initValue ?? ("content" in content.data.content ? content.data.content.content : []);
  return (
    <div data-tau-content={state.scope}>
      {css && <style data-tau-content-style={state.scope}>{css}</style>}
      <EditorKitScope kit={null}>
        <Editor
          {...props}
          key={state.scope}
          initValue={nodes as Descendant[]}
          readonly
          extensions={assembled}
        />
      </EditorKitScope>
    </div>
  );
}
