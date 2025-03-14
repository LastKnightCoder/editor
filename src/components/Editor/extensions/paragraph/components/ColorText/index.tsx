import { useState, useContext, useEffect, useMemo, useRef } from "react";
import { Editor, Range, Transforms } from "slate";
import { ReactEditor, useSlate, useSlateSelection } from "slate-react";
import { useMemoizedFn, useClickAway } from "ahooks";
import { Tooltip } from "antd";
import useTheme from "../../../../hooks/useTheme";

import SVG from "react-inlinesvg";
import { BiChevronDown } from "react-icons/bi";
import ColorSelect from "../ColorSelect";
import { HoveringBarContext } from "@/components/Editor/components/HoveringToolbar";

import classnames from "classnames";
import { isMarkActive } from "../../hovering-bar-configs/utils.ts";

import color from "@/assets/hovering_bar/color.svg";

import styles from "./index.module.less";

const ColorText = () => {
  const editor = useSlate();
  const selection = useSlateSelection();
  const { isDark } = useTheme();

  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<boolean>(false);
  const active = useMemo(() => {
    return isMarkActive("color", editor, selection);
  }, [editor, selection]);
  const activeColor = useMemo(() => {
    if (!active) return "currentColor";
    const marks = Editor.marks(editor);
    if (!marks) {
      return "currentColor";
    }
    const color = isDark ? marks?.darkColor : marks?.color;
    return color || "currentColor";
  }, [editor, isDark, active]);

  const { isHoveringBarShow } = useContext(HoveringBarContext);

  useEffect(() => {
    if (!isHoveringBarShow) {
      setOpen(false);
    }
  }, [isHoveringBarShow]);

  useClickAway(() => {
    setOpen(false);
  }, ref);

  const handleSelectColor = useMemoizedFn(
    (event: React.MouseEvent, color?: string, darkColor?: string) => {
      event.preventDefault();
      event.stopPropagation();
      Editor.addMark(editor, "color", color);
      Editor.addMark(editor, "darkColor", darkColor);
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
        e.stopPropagation();
        e.preventDefault();
        setOpen(!open);
      }}
    >
      <Tooltip title={"颜色"} trigger={"hover"}>
        <div className={styles.text}>
          <SVG
            src={color}
            style={{ fill: activeColor, width: 16, height: 16 }}
          />
          <BiChevronDown />
        </div>
      </Tooltip>
      <ColorSelect open={open} onClick={handleSelectColor} />
    </div>
  );
};

export default ColorText;
