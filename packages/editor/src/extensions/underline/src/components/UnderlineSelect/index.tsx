import { useEditorI18n } from "../../../../../i18n";
import { memo } from "react";
import {
  INLINE_PALETTE,
  getInlinePaletteEntry,
  inlineInk,
} from "@tau/editor/extensions/text-formatting/palette";
import {
  PanelGroup,
  Swatch,
  inlineStylePanelClass,
} from "@tau/editor/extensions/text-formatting/panels";
import { getUnderlineColor } from "../../colors.ts";

export type UnderlineLineType = "solid" | "dashed" | "dotted" | "wavy";

const LINE_TYPES: UnderlineLineType[] = ["solid", "dashed", "dotted", "wavy"];

interface IUnderlineSelectProps {
  selectedColor: string;
  selectedLineType: UnderlineLineType;
  onColorSelect: (color: string) => void;
  onLineTypeSelect: (lineType: UnderlineLineType) => void;
}

/** 下划线面板：颜色与统一色板同列同色（首格跟随文字），线型格直接画当前颜色的效果 */
const UnderlineSelect = memo((props: IUnderlineSelectProps) => {
  const { t } = useEditorI18n();
  const { selectedColor, selectedLineType, onColorSelect, onLineTypeSelect } = props;
  const lineColor = getUnderlineColor(selectedColor);
  const colorEntry = getInlinePaletteEntry(selectedColor);
  const colorLabel = colorEntry ? t(`palette.${colorEntry.id}`) : t("underline.inherit");

  return (
    <div className={inlineStylePanelClass}>
      <PanelGroup label={t("underline.color")} value={colorLabel}>
        <Swatch
          label={t("underline.inherit")}
          active={!getInlinePaletteEntry(selectedColor)}
          onPick={() => onColorSelect("default")}
        >
          <span className="h-[3px] w-4 rounded-[2px] bg-[var(--ed-text)]" />
        </Swatch>
        {INLINE_PALETTE.map(entry => (
          <Swatch
            key={entry.id}
            label={t(`palette.${entry.id}`)}
            active={selectedColor === entry.id}
            onPick={() => onColorSelect(entry.id)}
          >
            <span
              className="h-[3px] w-4 rounded-[2px]"
              style={{ backgroundColor: inlineInk(entry.id) }}
            />
          </Swatch>
        ))}
      </PanelGroup>

      <PanelGroup label={t("underline.type")}>
        {LINE_TYPES.map(lineType => (
          <Swatch
            key={lineType}
            label={t(`underline.${lineType}`)}
            active={selectedLineType === lineType}
            onPick={() => onLineTypeSelect(lineType)}
            className="h-[34px] w-[60px]"
          >
            <span
              className="text-[13px] underline decoration-[1.5px] underline-offset-4"
              style={{ textDecorationStyle: lineType, textDecorationColor: lineColor }}
            >
              {t("underline.sample")}
            </span>
          </Swatch>
        ))}
      </PanelGroup>
    </div>
  );
});

export default UnderlineSelect;
