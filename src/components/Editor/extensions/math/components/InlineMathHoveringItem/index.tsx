import React, { useMemo } from "react";
import { Editor, Transforms } from "slate";
import { ReactEditor, useSlate, useSlateSelection } from "slate-react";
import { useMemoizedFn } from "ahooks";
import { Tooltip } from "antd";
import { Sigma } from "lucide-react";

import classnames from "classnames";
import { unWrapInlineMath, wrapInlineMath } from "@/components/Editor/utils";
import useThemeColors from "@/hooks/useThemeColors";

const InlineMathHoveringItem = () => {
  const editor = useSlate();
  const selection = useSlateSelection();
  const themeColors = useThemeColors();

  const isActive = useMemo(() => {
    if (!selection) {
      return false;
    }
    const [math] = Editor.nodes(editor, {
      match: (n) => !Editor.isEditor(n) && n.type === "inline-math",
    });
    return !!math;
  }, [editor, selection]);

  const handleClick = useMemoizedFn((event: React.MouseEvent) => {
    try {
      if (isActive) {
        unWrapInlineMath(editor);
        return;
      }
      wrapInlineMath(editor);
    } finally {
      event.preventDefault();
      ReactEditor.focus(editor);
      Transforms.collapse(editor, { edge: "end" });
    }
  });

  return (
    <Tooltip title={"行内公式"} trigger={"hover"}>
      <div
        className={classnames(
          "flex items-center justify-center w-8 h-8 rounded-lg cursor-pointer transition-all duration-200",
          isActive
            ? themeColors.activeClass
            : classnames(
                themeColors.textClass,
                themeColors.hoverClass,
                themeColors.hoverTextClass,
              ),
        )}
        onClick={handleClick}
      >
        <Sigma size={16} strokeWidth={2.5} />
      </div>
    </Tooltip>
  );
};

export default InlineMathHoveringItem;
