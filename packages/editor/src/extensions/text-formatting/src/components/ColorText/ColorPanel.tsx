import { useEditorI18n } from "../../../../../i18n";
import { memo } from "react";
import { Ban, Eraser } from "lucide-react";
import {
  INLINE_PALETTE,
  TEXT_GRADIENT_PRESETS,
  gradientTextStyle,
  inlineHighlight,
  inlineInk,
  type InlinePaletteColor,
  type TextGradientPresetId,
} from "../../../palette.ts";
import {
  PanelAction,
  PanelGroup,
  Swatch,
  SwatchGlyph,
  inlineStylePanelClass,
} from "../InlineStylePanel/index.tsx";
import type { ColorValue } from "./colorMarks.ts";

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
  const { t } = useEditorI18n();
  const { value, onTextColor, onGradient, onHighlight, onClear } = props;

  const textLabel = value.gradient
    ? t(`gradient.${value.gradient}`)
    : value.text === "custom"
      ? t("color.custom")
      : value.text
        ? t(`palette.${value.text}`)
        : t("color.default");

  return (
    <div className={inlineStylePanelClass}>
      <PanelGroup label={t("color.text")} value={textLabel}>
        <Swatch
          label={t("color.default")}
          active={!value.text && !value.gradient}
          onPick={() => onTextColor(null)}
        >
          <SwatchGlyph />
        </Swatch>
        {INLINE_PALETTE.map(entry => (
          <Swatch
            key={entry.id}
            label={t(`palette.${entry.id}`)}
            active={value.text === entry.id}
            onPick={() => onTextColor(entry.id)}
          >
            <SwatchGlyph style={{ color: inlineInk(entry.id) }} />
          </Swatch>
        ))}
      </PanelGroup>

      <PanelGroup
        label={t("color.highlight")}
        value={value.highlight ? t(`palette.${value.highlight}`) : t("color.none")}
      >
        <Swatch
          label={t("color.noHighlight")}
          active={!value.highlight}
          onPick={() => onHighlight(null)}
        >
          <Ban size={16} className="text-[var(--ed-text-tertiary)]" />
        </Swatch>
        {INLINE_PALETTE.map(entry => {
          const colors = inlineHighlight(entry.id);
          if (!colors) return null;
          return (
            <Swatch
              key={entry.id}
              label={t("color.highlightLabel", { color: t(`palette.${entry.id}`) })}
              active={value.highlight === entry.id}
              onPick={() => onHighlight(entry.id)}
            >
              <span
                className="flex h-5 w-5 items-center justify-center rounded-[6px] border-b-2 border-solid text-[12px] leading-none font-semibold"
                style={{ backgroundColor: colors.background, borderBottomColor: colors.line }}
              >
                A
              </span>
            </Swatch>
          );
        })}
      </PanelGroup>

      <PanelGroup label={t("color.gradient")}>
        {GRADIENTS.map(gradient => (
          <Swatch
            key={gradient.id}
            label={t(`gradient.${gradient.id}`)}
            active={value.gradient === gradient.id}
            onPick={() => onGradient(gradient.id)}
          >
            <SwatchGlyph style={gradientTextStyle(gradient.id)} />
          </Swatch>
        ))}
      </PanelGroup>

      <PanelAction icon={<Eraser />} onClick={onClear}>
        {t("color.clear")}
      </PanelAction>
    </div>
  );
});

export default ColorPanel;
