import React, { PropsWithChildren, useEffect, useRef } from "react";
import { RenderElementProps, useSlateStatic, ReactEditor } from "slate-react";
import { Transforms } from "slate";
import useTheme from "../../../../hooks/useTheme";

import styles from "./index.module.less";

import { type CustomBlockElement } from "@/components/Editor/types";
import PreviewWithEditor from "@/components/Editor/components/PreviewWithEditor";
import { compileAndExecuteCustomBlock } from "@/components/Editor";

interface CustomBlockProps {
  attributes: RenderElementProps["attributes"];
  element: CustomBlockElement;
}

const CustomBlock = (props: { content: string }) => {
  const ref = useRef<HTMLDivElement>(null);
  const { isDark } = useTheme();
  const { content } = props;

  useEffect(() => {
    if (!ref.current || !content) return;

    let cleanup: (() => void) | undefined;

    compileAndExecuteCustomBlock(content, isDark, ref.current, {
      useTheme,
    }).then((cleanupFn) => {
      cleanup = cleanupFn;
    });

    return () => {
      cleanup?.();
    };
  }, [content, isDark]);

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
