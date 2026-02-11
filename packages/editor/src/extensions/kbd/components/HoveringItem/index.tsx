import React, { useMemo } from "react";
import { useMemoizedFn } from "ahooks";
import { Tooltip } from "antd";
import { Editor, Transforms } from "slate";
import { ReactEditor, useSlate, useSlateSelection } from "slate-react";
import { Keyboard } from "lucide-react";
import classnames from "classnames";

import useThemeColors from "../../../../hooks/useThemeColors";
import { wrapKbd, unwrapKbd } from "../../../../utils";

const HoveringItem = () => {
  const editor = useSlate();
  const selection = useSlateSelection();
  const themeColors = useThemeColors();

  const isActive = useMemo(() => {
    if (!selection) return false;
    const [kbdNode] = Editor.nodes(editor, {
      match: (n) => !Editor.isEditor(n) && n.type === "kbd",
    });
    return !!kbdNode;
  }, [editor, selection]);

  const handleClick = useMemoizedFn((event: React.MouseEvent) => {
    try {
      if (isActive) {
        unwrapKbd(editor);
        return;
      }
      wrapKbd(editor);
    } finally {
      event.preventDefault();
      ReactEditor.focus(editor);
      Transforms.collapse(editor, { edge: "end" });
    }
  });

  return (
    <Tooltip title={"快捷键"} trigger={"hover"}>
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
        <Keyboard size={16} strokeWidth={2.5} />
      </div>
    </Tooltip>
  );
};

export default HoveringItem;
