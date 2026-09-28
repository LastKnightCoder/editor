import React, { useMemo } from "react";
import { useMemoizedFn } from "ahooks";
import { Tooltip } from "antd";
import { Editor, NodeEntry, Transforms } from "slate";
import { ReactEditor, useSlate, useSlateSelection } from "slate-react";
import useTheme from "../../../../hooks/useTheme";
import { unwrapStyledText, wrapStyledText } from "../../../../utils";
import classnames from "classnames";

import { Pencil } from "lucide-react";
import type { StyledTextElement } from "../../../../types";
import { StyledTextColorStyle } from "../../../../constants";

const HoveringItem = () => {
  const editor = useSlate();
  const selection = useSlateSelection();
  const { isDark } = useTheme();

  const isActive = useMemo(() => {
    if (!selection) {
      return false;
    }
    const [styledText] = Editor.nodes(editor, {
      match: n => !Editor.isEditor(n) && n.type === "styled-text",
    });
    return !!styledText;
  }, [editor, selection]);

  const activeColor = useMemo(() => {
    if (!selection) return "currentColor";
    const [styledText] = Editor.nodes(editor, {
      match: n => !Editor.isEditor(n) && n.type === "styled-text",
    });
    if (!styledText) return "currentColor";
    const [node] = styledText as NodeEntry<StyledTextElement>;
    return StyledTextColorStyle[isDark ? "dark" : "light"][node.color].color;
  }, [editor, isDark, selection]);

  const handleClick = useMemoizedFn((event: React.MouseEvent) => {
    try {
      if (isActive) {
        unwrapStyledText(editor);
        return;
      }
      wrapStyledText(editor);
    } finally {
      event.preventDefault();
      ReactEditor.focus(editor);
      Transforms.collapse(editor, { edge: "end" });
    }
  });

  return (
    <Tooltip title={"样式文本"} trigger={"hover"}>
      <div
        className={classnames(
          "flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg transition-all duration-200",
          "ed-toolbar-item",
          isActive && "is-active"
        )}
        onClick={handleClick}
      >
        <Pencil
          size={16}
          color={activeColor === "currentColor" ? undefined : activeColor}
          strokeWidth={2.5}
        />
      </div>
    </Tooltip>
  );
};

export default HoveringItem;
