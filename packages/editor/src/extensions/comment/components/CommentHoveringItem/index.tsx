import React, { useMemo } from "react";
import { Editor, Transforms } from "slate";
import { ReactEditor, useSlate, useSlateSelection } from "slate-react";
import { useMemoizedFn } from "ahooks";
import { Tooltip } from "antd";
import { MessageSquarePlus } from "lucide-react";

import classnames from "classnames";
import { wrapComment, unwrapComment } from "../../../../utils";

const CommentHoveringItem = () => {
  const editor = useSlate();
  const selection = useSlateSelection();

  const isActive = useMemo(() => {
    if (!selection) {
      return false;
    }
    const [comment] = Editor.nodes(editor, {
      match: n => !Editor.isEditor(n) && n.type === "comment",
    });
    return !!comment;
  }, [editor, selection]);

  const handleClick = useMemoizedFn((event: React.MouseEvent) => {
    try {
      if (isActive) {
        unwrapComment(editor);
        return;
      }
      wrapComment(editor);
    } finally {
      event.preventDefault();
      ReactEditor.focus(editor);
      Transforms.collapse(editor, { edge: "end" });
    }
  });

  return (
    <Tooltip title={"批注"} trigger={"hover"}>
      <div
        className={classnames(
          "flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg transition-all duration-200",
          "ed-toolbar-item",
          isActive && "is-active"
        )}
        onClick={handleClick}
      >
        <MessageSquarePlus size={16} strokeWidth={2.5} />
      </div>
    </Tooltip>
  );
};

export default CommentHoveringItem;
