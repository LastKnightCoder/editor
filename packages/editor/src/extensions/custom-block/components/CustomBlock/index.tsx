import React, { PropsWithChildren, useEffect, useRef } from "react";
import { RenderElementProps, useSlateStatic, ReactEditor } from "slate-react";
import { Transforms } from "slate";
import useTheme from "../../../../hooks/useTheme";

import styles from "./index.module.less";

import { type CustomBlockElement } from "../../../types";
import PreviewWithEditor from "../../../../components/PreviewWithEditor";
import { compileAndExecuteCustomBlock } from "../../utils/renderTemplate";

interface CustomBlockProps {
  attributes: RenderElementProps["attributes"];
  element: CustomBlockElement;
}

const CustomBlock = (props: { content: string }) => {
  const ref = useRef<HTMLDivElement>(null);
  const { isDark } = useTheme();
  const { content } = props;
  const editor = useSlateStatic();

  useEffect(() => {
    if (!ref.current || !content) return;

    let cleanup: (() => void) | undefined;
    let disposed = false;
    const abortController = new AbortController();

    compileAndExecuteCustomBlock(
      content,
      isDark,
      ref.current,
      {
        useTheme,
      },
      editor.services?.compiler,
      abortController.signal,
    )
      .then((cleanupFn) => {
        if (!cleanupFn) return;
        if (disposed) {
          cleanupFn();
          return;
        }
        cleanup = cleanupFn;
      })
      .catch((err) => {
        console.error("Custom block render error", err);
      });

    return () => {
      disposed = true;
      abortController.abort();
      cleanup?.();
      cleanup = undefined;
    };
  }, [content, isDark, editor.services?.compiler]);

  return <div ref={ref}></div>;
};

const CustomBlockElement: React.FC<PropsWithChildren<CustomBlockProps>> = (
  props,
) => {
  const { attributes, children, element } = props;
  const { content } = element;

  const editor = useSlateStatic();
  const handleChange = (content: string) => {
    Transforms.setNodes(
      editor,
      { content },
      { at: ReactEditor.findPath(editor, element) },
    );
  };

  return (
    <div className={styles.container} {...attributes}>
      <PreviewWithEditor
        mode={"jsx"}
        initValue={content}
        element={element}
        onChange={handleChange}
      >
        {content ? (
          <CustomBlock content={content} />
        ) : (
          <div className={styles.empty}>点击编辑代码</div>
        )}
      </PreviewWithEditor>
      {children}
    </div>
  );
};

export default CustomBlockElement;
