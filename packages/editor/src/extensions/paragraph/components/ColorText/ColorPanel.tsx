import { memo } from "react";
import { Ban, Eraser } from "lucide-react";
import {
  INLINE_PALETTE,
  TEXT_GRADIENT_PRESETS,
  getInlinePaletteEntry,
  gradientTextStyle,
  inlineHighlight,
  inlineInk,
  type InlinePaletteColor,
  type TextGradientPresetId,
} from "../../../../constants";
import {
  PanelAction,
  PanelGroup,
  Swatch,
  SwatchGlyph,
  inlineStylePanelClass,
} from "../../../../components/InlineStylePanel";
import type { ColorValue } from "./colorMarks";

interface ColorPanelProps {
  value: ColorValue;
  onTextColor: (id: InlinePaletteColor | null) => void;
  onGradient: (id: TextGradientPresetId) => void;
  onHighlight: (id: InlinePaletteColor | null) => void;
  onClear: () => void;
}

const GRADIENTS = Object.values(TEXT_GRADIENT_PRESETS);

/** 颜色面板：字色 / 高亮两行按统一色板逐列对齐，渐变字另起一行 */
const ColorPanel = memo((props: ColorPanelProps) => {
  const { value, onTextColor, onGradient, onHighlight, onClear } = props;

  const textLabel = value.gradient
    ? TEXT_GRADIENT_PRESETS[value.gradient].label
    : value.text === "custom"
      ? "自定义"
      : (getInlinePaletteEntry(value.text)?.label ?? "默认");

  return (
    <div className={inlineStylePanelClass}>
      <PanelGroup label="文字" value={textLabel}>
        <Swatch
          label="默认"
          active={!value.text && !value.gradient}
          onPick={() => onTextColor(null)}
        >
          <SwatchGlyph />
        </Swatch>
        {INLINE_PALETTE.map(entry => (
          <Swatch
            key={entry.id}
            label={entry.label}
            active={value.text === entry.id}
            onPick={() => onTextColor(entry.id)}
          >
            <SwatchGlyph style={{ color: inlineInk(entry.id) }} />
          </Swatch>
        ))}
      </PanelGroup>

      <PanelGroup label="高亮" value={getInlinePaletteEntry(value.highlight)?.label ?? "无"}>
        <Swatch label="无高亮" active={!value.highlight} onPick={() => onHighlight(null)}>
          <Ban size={16} className="text-[var(--ed-text-tertiary)]" />
        </Swatch>
        {INLINE_PALETTE.map(entry => {
          const colors = inlineHighlight(entry.id)!;
          return (
            <Swatch
              key={entry.id}
              label={`${entry.label}高亮`}
              active={value.highlight === entry.id}
              onPick={() => onHighlight(entry.id)}
            >
              <span
                className="flex h-5 w-5 items-center justify-center rounded-[6px] border-b-2 border-solid text-[12px] font-semibold leading-none"
                style={{ backgroundColor: colors.background, borderBottomColor: colors.line }}
              >
                A
              </span>
            </Swatch>
          );
        })}
      </PanelGroup>

      <PanelGroup label="渐变字">
        {GRADIENTS.map(gradient => (
          <Swatch
            key={gradient.id}
            label={gradient.label}
            active={value.gradient === gradient.id}
            onPick={() => onGradient(gradient.id)}
          >
            <SwatchGlyph style={gradientTextStyle(gradient.id)} />
          </Swatch>
        ))}
      </PanelGroup>

      <PanelAction icon={<Eraser />} onClick={onClear}>
        清除颜色
      </PanelAction>
    </div>
  );
});

export default ColorPanel;
