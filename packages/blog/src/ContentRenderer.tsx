import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { ContentRef, DataResult } from "@tau/plugins/publish-data";
import type { Descendant } from "slate";
import { Editor } from "@tau/editor";
import { prepareContent } from "./load";
import { publishedKit } from "./kit";
import { LinkContext, type LinkRenderProps } from "./contentLink";
import { outlineOf, type OutlineHeading } from "./outline";

export interface ContentRendererProps {
  /** readData 的返回值。 */
  content: DataResult;
  /** 同一份数据里的其他正文段（如求索的描述、答案）；默认渲染 content.data.content.content。 */
  nodes?: readonly object[];
  /** 站内链接目标对应的页面地址；不传或返回空时链接只显示文字。 */
  hrefFor?: (target: ContentRef) => string | undefined;
  /** 自定义站内链接的展示（如悬停预览）；不传时渲染为普通链接。 */
  renderLink?: (props: LinkRenderProps) => ReactNode;
  /** 正文就绪后回调顶层标题，供目录使用。 */
  onOutline?: (headings: OutlineHeading[]) => void;
  /** 插件与样式准备完成前显示的内容。 */
  fallback?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function ContentRenderer({
  content,
  nodes,
  hrefFor,
  renderLink,
  onOutline,
  fallback = null,
  className,
  style,
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
  const kit = useMemo(() => publishedKit(content.settings), [content.settings]);
  const links = useMemo(
    () => ({ links: content.data.links, hrefFor, renderLink }),
    [content.data.links, hrefFor, renderLink]
  );
  const outline = useRef(onOutline);
  outline.current = onOutline;
  if (!state || state.content !== content) return fallback;
  if ("error" in state) throw state.error;
  const body = nodes ?? ("content" in content.data.content ? content.data.content.content : []);
  return (
    <div data-tau-content={content.data.key}>
      {state.prepared.styles.map((css, index) => (
        <style key={index} data-tau-content-style>
          {css}
        </style>
      ))}
      <LinkContext.Provider value={links}>
        <Editor
          key={content.dataUrl}
          kit={kit}
          initValue={body as unknown as Descendant[]}
          readonly
          extensions={state.prepared.extensions}
          className={className}
          style={style}
          onInit={(editor, value) => outline.current?.(outlineOf(editor, value))}
        />
      </LinkContext.Provider>
    </div>
  );
}
