import { ReactEditor, useSlate, useSlateSelection } from "slate-react";
import { useContext, useEffect, useMemo, useState, memo } from "react";
import { useMemoizedFn } from "ahooks";
import { Editor, Range, Transforms } from "slate";

import { Popover, Tooltip } from "antd";
import SVG from "react-inlinesvg";
import { BiChevronDown } from "react-icons/bi";
import HighlightSelect from "../HighlightSelect";

import highlight from "@/assets/hovering_bar/highlight.svg";

import styles from "./index.module.less";

import { isMarkActive } from "@/components/Editor/extensions/paragraph/hovering-bar-configs/utils.ts";
import { HoveringBarContext } from "@/components/Editor/components/HoveringToolbar";

import classnames from "classnames";

const HighlightText = memo(() => {
  const editor = useSlate();
  const selection = useSlateSelection();

  const [open, setOpen] = useState<boolean>(false);
  const active = useMemo(() => {
    return isMarkActive("highlight", editor, selection);
  }, [editor, selection]);

  const { isHoveringBarShow } = useContext(HoveringBarContext);

  const onOpenChange = useMemoizedFn((open: boolean) => {
    setOpen(open);
  });

  useEffect(() => {
    if (!isHoveringBarShow) {
      setOpen(false);
    }
  }, [isHoveringBarShow]);

  const handleClick = useMemoizedFn((label?: string) => {
    const selection = editor.selection;
    Editor.addMark(editor, "highlight", label);
    if (selection && !Range.isCollapsed(selection)) {
      ReactEditor.focus(editor);
      Transforms.collapse(editor, { edge: "end" });
    }
  });

  return (
    <Tooltip title={"高亮"} trigger={"hover"}>
      <Popover
        open={open}
        content={<HighlightSelect onClick={handleClick} />}
        placement="bottom"
        trigger={"hover"}
        onOpenChange={onOpenChange}
        styles={{
          body: {
            padding: 0,
            marginTop: "0.5em",
          },
        }}
        arrow={false}
      >
        <div
          className={classnames(styles.textContainer, {
            [styles.active]: active,
          })}
        >
          <div className={styles.text}>
            <SVG src={highlight} className={styles.icon} />
            <BiChevronDown />
          </div>
        </div>
      </Popover>
    </Tooltip>
  );
});

export default HighlightText;
