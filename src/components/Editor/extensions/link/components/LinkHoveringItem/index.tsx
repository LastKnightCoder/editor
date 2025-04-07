import { useMemo, memo } from "react";
import { Editor, Transforms } from "slate";
import { ReactEditor, useSlate, useSlateSelection } from "slate-react";
import { useMemoizedFn } from "ahooks";
import { Tooltip } from "antd";
import SVG from "react-inlinesvg";

import classnames from "classnames";
import { unwrapLink, wrapLink } from "@/components/Editor/utils";

import link from "@/assets/hovering_bar/link.svg";

import styles from "./index.module.less";

const LinkHoveringItem = memo(() => {
  const editor = useSlate();
  const selection = useSlateSelection();

  const isActive = useMemo(() => {
    if (!selection) {
      return false;
    }
    const [link] = Editor.nodes(editor, {
      match: (n) => !Editor.isEditor(n) && n.type === "link",
    });
    return !!link;
  }, [editor, selection]);

  const handleClick = useMemoizedFn((event: React.MouseEvent) => {
    try {
      if (isActive) {
        unwrapLink(editor);
        return;
      }
      wrapLink(editor, "", true);
    } finally {
      event.preventDefault();
      ReactEditor.focus(editor);
      Transforms.collapse(editor, { edge: "end" });
    }
  });

  return (
    <Tooltip title={"链接"} trigger={"hover"}>
      <div
        className={classnames(styles.markTextContainer, {
          [styles.active]: isActive,
        })}
        onClick={handleClick}
      >
        <SVG
          src={link}
          style={{ fill: "currentcolor", width: 16, height: 16 }}
        />
      </div>
    </Tooltip>
  );
});

export default LinkHoveringItem;
