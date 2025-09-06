import React, { memo, useState, useMemo } from "react";
import { useMemoizedFn } from "ahooks";
import {
  RenderElementProps,
  useReadOnly,
  useSlate,
  ReactEditor,
} from "slate-react";
import { Popover } from "antd";
import { AnnotationElement } from "@/components/Editor/types";
import { Transforms } from "slate";
import EditText from "@/components/EditText";
import useTheme from "../../../../hooks/useTheme";

interface AnnotationProps {
  attributes: RenderElementProps["attributes"];
  element: AnnotationElement;
}

const styles = {
  body: {
    padding: 0,
    background: "transparent",
    borderRadius: 0,
    boxShadow: "none",
  },
};

const Annotation: React.FC<React.PropsWithChildren<AnnotationProps>> = memo(
  (props) => {
    const { attributes, children, element } = props;
    const { content } = element;
    const readOnly = useReadOnly();
    const editor = useSlate();
    const [open, setOpen] = useState(false);
    const [isHovering, setIsHovering] = useState(false);

    const { isDark } = useTheme();

    const handleClick = useMemoizedFn((e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setOpen(!open);
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
          className="p-[0.75em_1em] text-[0.875em] leading-[1.4] max-w-[20em] rounded-md"
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
        className="relative inline-block w-[1.5em] h-[1.5em]"
        contentEditable={false}
      >
        <span className="relative inline">{children}</span>
        <Popover
          content={popoverContent}
          trigger="click"
          open={open}
          onOpenChange={setOpen}
          placement="top"
          styles={styles}
          arrow={false}
        >
          <span
            contentEditable={false}
            className="absolute top-[-0.5em] right-[0.5em] text-[0.75em] cursor-pointer rounded-full w-[1.5em] h-[1.5em] flex items-center justify-center transition-all duration-200 z-10 select-none"
            style={{
              color: isHovering
                ? isDark
                  ? "#fff"
                  : "#1E2939"
                : isDark
                  ? "#D1D5DC"
                  : "#99A1AF",
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
        </Popover>
      </span>
    );
  },
);

export default Annotation;
