import React, { useMemo } from "react";
import { Editor, Transforms } from "slate";
import { ReactEditor, useSlate, useSlateSelection } from "slate-react";
import { useMemoizedFn } from "ahooks";
import { Tooltip } from "antd";
import { MessageOutlined } from "@ant-design/icons";

import classnames from "classnames";
import { wrapComment, unwrapComment } from "@/components/Editor/utils";

import styles from "./index.module.less";

const CommentHoveringItem = () => {
  const editor = useSlate();
  const selection = useSlateSelection();

  const isActive = useMemo(() => {
    if (!selection) {
      return false;
    }
    const [comment] = Editor.nodes(editor, {
      match: (n) => !Editor.isEditor(n) && n.type === "comment",
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
        className={classnames(styles.markTextContainer, {
          [styles.active]: isActive,
        })}
        onClick={handleClick}
      >
        <MessageOutlined style={{ fontSize: "16px" }} />
      </div>
    </Tooltip>
  );
};

export default CommentHoveringItem;
