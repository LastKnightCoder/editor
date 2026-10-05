import React, { PropsWithChildren, useEffect, useRef, useState } from "react";
import { RenderElementProps, useSlateStatic, ReactEditor } from "slate-react";
import { Transforms } from "slate";
import { useEditorTheme } from "@tau/editor/api";
import { PreviewWithEditor } from "@tau/editor-source-view";
import { IRuntimeStyleCompiler } from "@tau/shared/runtime-style";

import { type CustomBlockElement } from "../../types";
import { useReportPreviewError } from "@tau/editor-source-view";
import { compileAndExecuteCustomBlock, rerenderCustomBlockTheme } from "../../utils/renderTemplate";
import { Blocks } from "lucide-react";

interface CustomBlockProps {
  attributes: RenderElementProps["attributes"];
  element: CustomBlockElement;
}

const CustomBlock = (props: { content: string }) => {
  const ref = useRef<HTMLDivElement>(null);
  // 明暗、主题族或 token 变化时对象引用都会变，模板随之重渲染（只重渲染，不重编译）
  const theme = useEditorTheme();
  const { content } = props;
  const editor = useSlateStatic();
  const compilerService = editor.tryGetService(IRuntimeStyleCompiler);
  const latestThemeRef = useRef(theme);
  latestThemeRef.current = theme;
  // 失败时容器已被上一次的清理清空，没有可保留的旧结果
  const [error, setError] = useState<string | null>(null);
  useReportPreviewError(error, { stale: false });

  useEffect(() => {
    if (!ref.current || !content) return;

    let cleanup: (() => void) | undefined;
    let disposed = false;
    const abortController = new AbortController();

    compileAndExecuteCustomBlock(
      content,
      latestThemeRef.current,
      ref.current,
      compilerService,
      abortController.signal
    )
      .then(cleanupFn => {
        if (!disposed) setError(null);
        if (!cleanupFn) return;
        if (disposed) {
          cleanupFn();
          return;
        }
        cleanup = cleanupFn;
      })
      .catch(err => {
        console.error("Custom block render error", err);
        if (!disposed) setError(err instanceof Error ? err.message : String(err));
      });

    return () => {
      disposed = true;
      abortController.abort();
      cleanup?.();
      cleanup = undefined;
    };
  }, [content, compilerService]);

  useEffect(() => {
    if (!ref.current) return;
    rerenderCustomBlockTheme(ref.current, theme);
  }, [theme]);

  // 内边距由块容器统一提供：悬停底色出现时内容不贴边，模板无需再写外层留白
  return <div ref={ref} className="px-[1em] py-[0.875em]"></div>;
};

const CustomBlockElement: React.FC<PropsWithChildren<CustomBlockProps>> = props => {
  const { attributes, children, element } = props;
  const { content } = element;

  const editor = useSlateStatic();
  const handleChange = (content: string) => {
    Transforms.setNodes(editor, { content }, { at: ReactEditor.findPath(editor, element) });
  };

  return (
    <div className="relative cursor-pointer" {...attributes}>
      <PreviewWithEditor
        mode={"jsx"}
        title="自定义块"
        icon={Blocks}
        fluid
        initValue={content}
        element={element}
        onChange={handleChange}
      >
        <CustomBlock content={content} />
      </PreviewWithEditor>
      {children}
    </div>
  );
};

export default CustomBlockElement;
