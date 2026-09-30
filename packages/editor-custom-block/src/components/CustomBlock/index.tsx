import React, { PropsWithChildren, useEffect, useRef } from "react";
import { RenderElementProps, useSlateStatic, ReactEditor } from "slate-react";
import { Transforms } from "slate";
import { useEditorTheme, ICompilerService, PreviewWithEditor } from "@tau/editor/api";

import { type CustomBlockElement } from "../../types";
import { compileAndExecuteCustomBlock, rerenderCustomBlockTheme } from "../../utils/renderTemplate";

interface CustomBlockProps {
  attributes: RenderElementProps["attributes"];
  element: CustomBlockElement;
}

const CustomBlock = (props: { content: string }) => {
  const ref = useRef<HTMLDivElement>(null);
  const { isDark } = useEditorTheme();
  const { content } = props;
  const editor = useSlateStatic();
  const compilerService = editor.tryGetService(ICompilerService);
  const latestThemeRef = useRef(isDark);
  latestThemeRef.current = isDark;

  useEffect(() => {
    if (!ref.current || !content) return;

    let cleanup: (() => void) | undefined;
    let disposed = false;
    const abortController = new AbortController();

    compileAndExecuteCustomBlock(
      content,
      latestThemeRef.current,
      ref.current,
      {
        useTheme: useEditorTheme,
      },
      compilerService,
      abortController.signal
    )
      .then(cleanupFn => {
        if (!cleanupFn) return;
        if (disposed) {
          cleanupFn();
          return;
        }
        cleanup = cleanupFn;
      })
      .catch(err => {
        console.error("Custom block render error", err);
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
    rerenderCustomBlockTheme(ref.current, isDark);
  }, [isDark]);

  return <div ref={ref}></div>;
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
      <PreviewWithEditor mode={"jsx"} initValue={content} element={element} onChange={handleChange}>
        {content ? (
          <CustomBlock content={content} />
        ) : (
          <div className="flex h-[3.75em] cursor-pointer items-center justify-center">
            点击编辑代码
          </div>
        )}
      </PreviewWithEditor>
      {children}
    </div>
  );
};

export default CustomBlockElement;
