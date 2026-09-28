import { useState, useContext, useEffect, useMemo, memo } from "react";
import { Editor, Range, Transforms } from "slate";
import { ReactEditor, useSlate, useSlateSelection } from "slate-react";
import { useMemoizedFn } from "ahooks";
import { Tooltip } from "antd";
import useTheme from "../../../../hooks/useTheme";
import {
  TEXT_GRADIENT_PRESETS,
  resolveTextGradientStyle,
  type TextGradientPresetId,
} from "../../../../constants";

import { Baseline, ChevronDown } from "lucide-react";
import ColorSelect from "../ColorSelect";
import { HoveringBarContext } from "../../../../components/HoveringToolbar";
import FloatingSubmenu from "../../../../components/HoveringToolbar/FloatingSubmenu";

import classnames from "classnames";

const ColorText = memo(() => {
  const editor = useSlate();
  const selection = useSlateSelection();
  const { isDark } = useTheme();

  const [open, setOpen] = useState<boolean>(false);

  const marks = useMemo(() => {
    return Editor.marks(editor) as Record<string, unknown> | null;
  }, [editor, selection]);

  const active = useMemo(() => {
    return Boolean(marks?.color || marks?.darkColor || marks?.textGradient);
  }, [marks]);

  const activeColor = useMemo(() => {
    if (!active) return "currentColor";
    if (!marks) {
      return "currentColor";
    }
    const textGradient = marks.textGradient;
    if (typeof textGradient === "string" && textGradient in TEXT_GRADIENT_PRESETS) {
      return resolveTextGradientStyle(
        textGradient as TextGradientPresetId,
        isDark ? "dark" : "light"
      ).fallbackColor;
    }
    const color = isDark ? marks.darkColor : marks.color;
    return typeof color === "string" && color ? color : "currentColor";
  }, [active, isDark, marks]);

  const { isHoveringBarShow, isCompact, submenuTrigger } = useContext(HoveringBarContext);

  useEffect(() => {
    if (!isHoveringBarShow) {
      setOpen(false);
    }
  }, [isHoveringBarShow]);

  const handleSelectColor = useMemoizedFn(
    (color?: string, darkColor?: string, gradientPreset?: TextGradientPresetId) => {
      if (gradientPreset) {
        Editor.removeMark(editor, "color");
        Editor.removeMark(editor, "darkColor");
        Editor.addMark(editor, "textGradient", gradientPreset);
      } else if (color || darkColor) {
        Editor.removeMark(editor, "textGradient");
        Editor.addMark(editor, "color", color);
        Editor.addMark(editor, "darkColor", darkColor);
      } else {
        Editor.removeMark(editor, "textGradient");
        Editor.removeMark(editor, "color");
        Editor.removeMark(editor, "darkColor");
      }
      if (selection && !Range.isCollapsed(selection)) {
        ReactEditor.focus(editor);
        Transforms.collapse(editor, { edge: "end" });
      }
      if (isCompact) {
        setOpen(false);
      }
    }
  );

  return (
    <FloatingSubmenu
      open={open}
      onOpenChange={setOpen}
      trigger={submenuTrigger}
      isHoveringBarShow={isHoveringBarShow}
      content={<ColorSelect onClick={handleSelectColor} />}
      zIndex={10100}
      gap={10}
    >
      <Tooltip title={"颜色"} trigger={"hover"}>
        <div
          className={classnames(
            "flex h-8 cursor-pointer items-center justify-center gap-0.5 rounded-lg px-1.5 transition-all duration-200",
            "ed-toolbar-item",
            active && "is-active"
          )}
        >
          <Baseline
            size={16}
            color={activeColor === "currentColor" ? undefined : activeColor}
            strokeWidth={2.5}
          />
          <ChevronDown size={12} className="opacity-50" strokeWidth={2.5} />
        </div>
      </Tooltip>
    </FloatingSubmenu>
  );
});

export default ColorText;
