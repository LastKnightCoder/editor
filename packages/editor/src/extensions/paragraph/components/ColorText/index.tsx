import React, { useState, useContext, useEffect, useMemo, memo } from "react";
import { Transforms } from "slate";
import { ReactEditor, useSlate } from "slate-react";
import { useMemoizedFn } from "ahooks";
import { ChevronDown } from "lucide-react";
import classnames from "classnames";

import { Tooltip } from "../../../../ui/Tooltip";
import {
  TEXT_GRADIENT_PRESETS,
  getInlinePaletteEntry,
  inlineGradient,
  inlineHighlight,
  inlineInk,
  type InlinePaletteColor,
  type TextGradientPresetId,
} from "../../../../constants";
import { HoveringBarContext } from "../../../../components/HoveringToolbar";
import FloatingSubmenu from "../../../../components/HoveringToolbar/FloatingSubmenu";
import ColorPanel from "./ColorPanel";
import {
  applyColorValue,
  clearColors,
  readColorValue,
  readLastColor,
  setHighlight,
  setTextColor,
  setTextGradient,
  writeLastColor,
  type ColorValue,
} from "./colorMarks";

/** 「A」字形遮罩：取 lucide Baseline 的字母部分（24 栅格、2.5 线宽，与工具条其他图标同几何），色条单独画 */
const GLYPH_MASK = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 16 6-12 6 12"/><path d="M8 12h8"/></svg>'
)}")`;

const describeColor = (value: ColorValue) => {
  const parts = [
    value.gradient
      ? `${TEXT_GRADIENT_PRESETS[value.gradient].label}渐变`
      : getInlinePaletteEntry(value.text)?.label,
    value.highlight ? `${getInlinePaletteEntry(value.highlight)?.label}高亮` : undefined,
  ].filter(Boolean);
  return parts.join(" + ");
};

/**
 * 颜色入口（字色 + 渐变 + 高亮合一）：左半一键套用最近一次的组合，右侧箭头展开面板。
 * 按钮上的 A 与色条显示这个「最近组合」，点下去是什么效果一目了然。
 */
const ColorText = memo(() => {
  const editor = useSlate();
  const { isHoveringBarShow, isCompact, submenuTrigger } = useContext(HoveringBarContext);

  const [open, setOpen] = useState(false);
  const [lastColor, setLastColor] = useState<ColorValue>(readLastColor);

  // 不按选区缓存：只加 mark、选区不变时也要反映新取值（useSlate 随每次变更重渲染）
  const value = readColorValue(editor);
  const active = Boolean(value.text || value.gradient || value.highlight);

  useEffect(() => {
    if (!isHoveringBarShow) setOpen(false);
  }, [isHoveringBarShow]);

  const remember = useMemoizedFn((patch: Partial<ColorValue>) => {
    const next = { ...lastColor, ...patch };
    setLastColor(next);
    writeLastColor(next);
  });

  // 面板里挑色不收起选区：字色与高亮可以连着选
  const afterPick = useMemoizedFn(() => {
    if (isCompact) setOpen(false);
  });

  const handleTextColor = useMemoizedFn((id: InlinePaletteColor | null) => {
    setTextColor(editor, id);
    remember({ text: id, gradient: null });
    afterPick();
  });

  const handleGradient = useMemoizedFn((id: TextGradientPresetId) => {
    setTextGradient(editor, id);
    remember({ text: null, gradient: id });
    afterPick();
  });

  const handleHighlight = useMemoizedFn((id: InlinePaletteColor | null) => {
    setHighlight(editor, id);
    remember({ highlight: id });
    afterPick();
  });

  const handleClear = useMemoizedFn(() => {
    clearColors(editor);
    afterPick();
  });

  const handleApplyLast = useMemoizedFn((event: React.MouseEvent) => {
    event.preventDefault();
    // 不冒泡到子菜单触发器：点击模式下左半只套用、不开面板
    event.stopPropagation();
    applyColorValue(editor, lastColor);
    ReactEditor.focus(editor);
    Transforms.collapse(editor, { edge: "end" });
  });

  // 字形用遮罩 + 背景填色：纯色与渐变同一条路径；无字色时 bg-current 跟随按钮墨色
  const glyphStyle = useMemo<React.CSSProperties>(() => {
    const fill = lastColor.gradient
      ? inlineGradient(lastColor.gradient)
      : inlineInk(lastColor.text);
    return {
      background: fill,
      maskImage: GLYPH_MASK,
      WebkitMaskImage: GLYPH_MASK,
      maskSize: "100% 100%",
      WebkitMaskSize: "100% 100%",
    };
  }, [lastColor]);
  const barColor = inlineHighlight(lastColor.highlight)?.line;

  return (
    <FloatingSubmenu
      open={open}
      onOpenChange={setOpen}
      trigger={submenuTrigger}
      isHoveringBarShow={isHoveringBarShow}
      zIndex={10100}
      gap={10}
      content={
        <ColorPanel
          value={value}
          onTextColor={handleTextColor}
          onGradient={handleGradient}
          onHighlight={handleHighlight}
          onClear={handleClear}
        />
      }
    >
      <div
        className={classnames(
          "ed-toolbar-item flex h-8 items-center rounded-lg",
          active && "is-active",
          open && "is-open"
        )}
      >
        <Tooltip content={`套用 ${describeColor(lastColor) || "默认"}`} disabled={open}>
          <div
            className="flex h-8 w-7 cursor-pointer items-center justify-center rounded-l-lg"
            onClick={handleApplyLast}
          >
            {/* 16px 图标盒，与工具条其他图标同尺寸；色条落在 Baseline 底线位置（y=20/24） */}
            <span aria-hidden className="relative size-4 shrink-0">
              <span className="absolute inset-0 bg-current" style={glyphStyle} />
              <span
                className={classnames(
                  "absolute inset-x-[2.5px] top-[12.5px] h-[2.5px] rounded-full",
                  !barColor && "bg-current opacity-35"
                )}
                style={barColor ? { backgroundColor: barColor } : undefined}
              />
            </span>
          </div>
        </Tooltip>
        <div
          aria-label="颜色选项"
          className="flex h-8 w-4 cursor-pointer items-center justify-center rounded-r-lg pr-0.5 transition-colors duration-150 hover:bg-[var(--ed-bg-press)]"
        >
          <ChevronDown size={11} strokeWidth={3} className="opacity-60" />
        </div>
      </div>
    </FloatingSubmenu>
  );
});

export default ColorText;
