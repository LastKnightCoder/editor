import React, { useMemo } from "react";
import { Editor, Transforms } from "slate";
import { ReactEditor, useSlate, useSlateSelection } from "slate-react";
import { useMemoizedFn } from "ahooks";
import { Tooltip } from "@tau/ui";
import { Sigma } from "lucide-react";

import classnames from "classnames";
import { unWrapInlineMath, wrapInlineMath } from "../../insert";

const InlineMathHoveringItem = () => {
  const editor = useSlate();
  const selection = useSlateSelection();

  const isActive = useMemo(() => {
    if (!selection) {
      return false;
    }
    const [math] = Editor.nodes(editor, {
      match: n => !Editor.isEditor(n) && n.type === "inline-math",
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
    <Tooltip content={"行内公式"} className="z-[10200]">
      <div
        className={classnames(
          "flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg transition-all duration-200",
          "ed-toolbar-item",
          isActive && "is-active"
        )}
        onClick={handleClick}
      >
        <Sigma size={16} strokeWidth={2.5} />
      </div>
    </Tooltip>
  );
};

export default InlineMathHoveringItem;
