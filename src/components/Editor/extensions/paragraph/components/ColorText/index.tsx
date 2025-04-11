import { useState, useContext, useEffect, useMemo, memo } from "react";
import { Editor, Range, Transforms } from "slate";
import { ReactEditor, useSlate, useSlateSelection } from "slate-react";
import { useMemoizedFn } from "ahooks";
import { Tooltip, Popover } from "antd";
import useTheme from "../../../../hooks/useTheme";

import SVG from "react-inlinesvg";
import { BiChevronDown } from "react-icons/bi";
import ColorSelect from "../ColorSelect";
import { HoveringBarContext } from "@/components/Editor/components/HoveringToolbar";

import classnames from "classnames";
import { isMarkActive } from "../../hovering-bar-configs/utils.ts";

import color from "@/assets/hovering_bar/color.svg";

import styles from "./index.module.less";

const ColorText = memo(() => {
  const editor = useSlate();
  const selection = useSlateSelection();
  const { isDark } = useTheme();

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

  const handleSelectColor = useMemoizedFn(
    (color?: string, darkColor?: string) => {
      Editor.addMark(editor, "color", color);
      Editor.addMark(editor, "darkColor", darkColor);
      if (selection && !Range.isCollapsed(selection)) {
        ReactEditor.focus(editor);
        Transforms.collapse(editor, { edge: "end" });
      }
    },
  );

  return (
    <Tooltip title={"颜色"} trigger={"hover"}>
      <Popover
        open={open}
        content={<ColorSelect onClick={handleSelectColor} />}
        placement="bottom"
        trigger={"hover"}
        onOpenChange={setOpen}
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
            <SVG
              src={color}
              style={{ fill: activeColor }}
              className={styles.icon}
            />
            <BiChevronDown />
          </div>
        </div>
      </Popover>
    </Tooltip>
  );
});

export default ColorText;
