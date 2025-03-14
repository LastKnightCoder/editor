import { ReactEditor, useSlate, useSlateSelection } from "slate-react";
import { useContext, useEffect, useMemo, useState, useRef } from "react";
import { useMemoizedFn, useClickAway } from "ahooks";
import { Editor, Range, Transforms } from "slate";

import { Tooltip } from "antd";
import SVG from "react-inlinesvg";
import { BiChevronDown } from "react-icons/bi";
import HighlightSelect from "../HighlightSelect";

import highlight from "@/assets/hovering_bar/highlight.svg";

import styles from "./index.module.less";

import { isMarkActive } from "@/components/Editor/extensions/paragraph/hovering-bar-configs/utils.ts";
import { HoveringBarContext } from "@/components/Editor/components/HoveringToolbar";

import classnames from "classnames";

const HighlightText = () => {
  const editor = useSlate();
  const selection = useSlateSelection();

  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<boolean>(false);
  const active = useMemo(() => {
    return isMarkActive("highlight", editor, selection);
  }, [editor, selection]);

  const { isHoveringBarShow } = useContext(HoveringBarContext);

  useEffect(() => {
    if (!isHoveringBarShow) {
      setOpen(false);
    }
  }, [isHoveringBarShow]);

  useClickAway(() => {
    setOpen(false);
  }, ref);

  const handleClick = useMemoizedFn(
    (event: React.MouseEvent, label?: string) => {
      event.preventDefault();
      event.stopPropagation();
      const selection = editor.selection;
      Editor.addMark(editor, "highlight", label);
      if (selection && !Range.isCollapsed(selection)) {
        ReactEditor.focus(editor);
        Transforms.collapse(editor, { edge: "end" });
      }
    },
  );

  return (
    <div
      ref={ref}
      className={classnames(styles.textContainer, { [styles.active]: active })}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOpen(!open);
      }}
    >
      <Tooltip title={"高亮"} trigger={"hover"}>
        <div className={styles.text}>
          <SVG
            src={highlight}
            style={{ fill: "currentcolor", width: 16, height: 16 }}
          />
          <BiChevronDown />
        </div>
        <HighlightSelect open={open} onClick={handleClick} />
      </Tooltip>
    </div>
  );
};

export default HighlightText;
