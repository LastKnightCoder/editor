import React, { useMemo } from "react";
import { useMemoizedFn } from "ahooks";
import { Tooltip } from "../../../../ui/Tooltip";
import { Editor, Transforms } from "slate";
import { ReactEditor, useSlate, useSlateSelection } from "slate-react";
import { Keyboard } from "lucide-react";
import classnames from "classnames";

import { wrapKbd, unwrapKbd } from "../../../../utils";

const HoveringItem = () => {
  const editor = useSlate();
  const selection = useSlateSelection();

  const isActive = useMemo(() => {
    if (!selection) return false;
    const [kbdNode] = Editor.nodes(editor, {
      match: n => !Editor.isEditor(n) && n.type === "kbd",
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
    <Tooltip content={"快捷键"}>
      <div
        className={classnames(
          "flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg transition-all duration-200",
          "ed-toolbar-item",
          isActive && "is-active"
        )}
        onClick={handleClick}
      >
        <Keyboard size={16} strokeWidth={2.5} />
      </div>
    </Tooltip>
  );
};

export default HoveringItem;
