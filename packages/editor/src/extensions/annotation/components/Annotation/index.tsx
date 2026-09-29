import React, { memo, useState, useMemo } from "react";
import { useMemoizedFn } from "ahooks";
import { RenderElementProps, useReadOnly, useSlateStatic, ReactEditor } from "slate-react";
import { EditText } from "@tau/shared";
import type { AnnotationElement } from "../../../types";
import { Transforms } from "slate";
import useTheme from "../../../../hooks/useTheme";
import { Popover } from "@tau/ui";

interface AnnotationProps {
  attributes: RenderElementProps["attributes"];
  element: AnnotationElement;
}

const Annotation: React.FC<React.PropsWithChildren<AnnotationProps>> = memo(props => {
  const { attributes, children, element } = props;
  const { content } = element;
  const readOnly = useReadOnly();
  const editor = useSlateStatic();
  const [open, setOpen] = useState(false);
  const [isHovering, setIsHovering] = useState(false);

  const { isDark } = useTheme();

  // 开合由 Popover 的触发器处理；这里只挡住冒泡，别让 Slate 把点击当成移动选区
  const handleClick = useMemoizedFn((e: React.MouseEvent) => {
    e.stopPropagation();
  });

  const handleMouseEnter = useMemoizedFn(() => {
    setIsHovering(true);
  });

  const handleMouseLeave = useMemoizedFn(() => {
    setIsHovering(false);
  });

  const onContentChange = useMemoizedFn((val: string) => {
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(editor, { content: val }, { at: path });
  });

  const popoverContent = useMemo(() => {
    return (
      <div
        className="max-w-[20em] rounded-md p-[0.75em_1em] text-[0.875em] leading-[1.4]"
        style={{
          color: "#fff",
          backgroundColor: "rgba(0, 0, 0, 0.8)",
        }}
      >
        <EditText
          defaultValue={content}
          contentEditable={!readOnly}
          onChange={onContentChange}
          isSlateEditor={false}
          defaultFocus={!readOnly}
        />
      </div>
    );
  }, [content, readOnly, onContentChange]);

  return (
    <span
      {...attributes}
      className="relative inline-block h-[1.5em] w-[1.5em]"
      contentEditable={false}
    >
      <span className="relative inline">{children}</span>
      <Popover
        open={open}
        onOpenChange={setOpen}
        placement="top"
        arrow={false}
        // 批注气泡自带深色底，浮层只做定位
        className="min-w-0 border-0 bg-transparent shadow-none"
        trigger={
          <span
            contentEditable={false}
            className="absolute right-[0.5em] top-[-0.5em] z-10 flex h-[1.5em] w-[1.5em] cursor-pointer select-none items-center justify-center rounded-full text-[0.75em] transition-all duration-200"
            style={{
              color: isHovering ? (isDark ? "#fff" : "#1E2939") : isDark ? "#D1D5DC" : "#99A1AF",
              backgroundColor: isHovering
                ? isDark
                  ? "rgba(255, 255, 255, 0.2)"
                  : "rgba(0, 0, 0, 0.2)"
                : isDark
                  ? "rgba(255, 255, 255, 0.1)"
                  : "rgba(0, 0, 0, 0.1)",
            }}
            onClick={handleClick}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            注
          </span>
        }
      >
        {popoverContent}
      </Popover>
    </span>
  );
});

export default Annotation;
