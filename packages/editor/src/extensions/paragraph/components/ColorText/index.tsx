import { useState, useContext, useEffect, useMemo, memo } from "react";
import { Editor, Range, Transforms } from "slate";
import { ReactEditor, useSlate, useSlateSelection } from "slate-react";
import { useMemoizedFn } from "ahooks";
import { Tooltip, Popover } from "antd";
import useTheme from "../../../../hooks/useTheme";
import useThemeColors from "../../../../hooks/useThemeColors";

import { Baseline, ChevronDown } from "lucide-react";
import ColorSelect from "../ColorSelect";
import { HoveringBarContext } from "../../../../components/HoveringToolbar";

import classnames from "classnames";
import { isMarkActive } from "../../hovering-bar-configs/utils";

const ColorText = memo(() => {
  const editor = useSlate();
  const selection = useSlateSelection();
  const { isDark } = useTheme();
  const themeColors = useThemeColors();

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

  const { isHoveringBarShow, isCompact, submenuTrigger } =
    useContext(HoveringBarContext);

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
      if (isCompact) {
        setOpen(false);
      }
    },
  );

  return (
    <Tooltip title={"颜色"} trigger={"hover"}>
      <Popover
        open={open}
        content={<ColorSelect onClick={handleSelectColor} />}
        placement="bottom"
        trigger={submenuTrigger}
        onOpenChange={setOpen}
        autoAdjustOverflow
        align={{ overflow: { adjustX: 1, adjustY: 1 } }}
        getPopupContainer={() => document.body}
        destroyOnHidden
        zIndex={10100}
        styles={{
          container: {
            padding: 0,
            marginTop: "0.75em",
            maxWidth: "calc(100vw - 16px)",
            background: "transparent",
            boxShadow: "none",
            border: "none",
            backdropFilter: "none",
          },
        }}
        arrow={false}
      >
        <div
          className={classnames(
            "flex items-center justify-center gap-0.5 px-1.5 h-8 rounded-lg cursor-pointer transition-all duration-200",
            active
              ? themeColors.activeClass
              : classnames(
                  themeColors.textClass,
                  themeColors.hoverClass,
                  themeColors.hoverTextClass,
                ),
          )}
        >
          <Baseline
            size={16}
            color={activeColor === "currentColor" ? undefined : activeColor}
            strokeWidth={2.5}
          />
          <ChevronDown size={12} className="opacity-50" strokeWidth={2.5} />
        </div>
      </Popover>
    </Tooltip>
  );
});

export default ColorText;
