import React, { useCallback, useEffect, memo } from "react";
import { Editor, Transforms } from "slate";
import { ReactEditor, RenderElementProps, useSlateSelector, useSlateStatic } from "slate-react";
import { cn } from "@tau/ui";

import type { ParagraphElement } from "../../../../model/paragraph";

import { useMemoizedFn } from "ahooks";
import { findPathSafely } from "../../../../utils";

interface IParagraphProps {
  attributes: RenderElementProps["attributes"];
  element: ParagraphElement;
}

// 拖拽手柄与手柄菜单由内核的 BlockDragHost 统一渲染（01 §5.4 拖拽声明化）
const Paragraph: React.FC<React.PropsWithChildren<IParagraphProps>> = memo(props => {
  const { children, attributes, element } = props;

  const editor = useSlateStatic();
  const isLast = useSlateSelector(
    useCallback(
      (current: Editor) => {
        const path = findPathSafely(current, element);
        if (!path) return false;
        if (path.length === 1) return current.children.at(-1) === element;
        try {
          return Editor.parent(current, path)[0].children.at(-1) === element;
        } catch {
          return false;
        }
      },
      [element]
    ),
    undefined,
    { deferred: true }
  );

  const handleFocus = useMemoizedFn((start = true) => {
    return (e: any) => {
      const { detail } = e;
      if (!detail) return;
      const { focusElement } = detail;
      if (element === focusElement) {
        const path = findPathSafely(editor, element);
        if (!path) {
          return;
        }
        ReactEditor.focus(editor);
        if (start) {
          Transforms.select(editor, {
            anchor: Editor.start(editor, [...path, 0]),
            focus: Editor.start(editor, [...path, 0]),
          });
        } else {
          Transforms.select(editor, {
            anchor: Editor.end(editor, path),
            focus: Editor.end(editor, path),
          });
        }
      }
    };
  });

  useEffect(() => {
    const handleFocusStart = handleFocus(true);
    const handleFocusEnd = handleFocus(false);

    document.addEventListener("element-focus-start", handleFocusStart);
    document.addEventListener("element-focus-end", handleFocusEnd);

    return () => {
      document.removeEventListener("element-focus-start", handleFocusStart);
      document.removeEventListener("element-focus-end", handleFocusEnd);
    };
  }, [handleFocus]);

  return (
    // flow-root 建立 BFC，防止段落 margin 折叠出容器，悬停区域才包得住段落的下边距
    <div className="relative flow-root">
      <p {...attributes} className={cn("relative mb-[1.25em]", isLast && "mb-0!")}>
        {children}
      </p>
    </div>
  );
});

export default Paragraph;
