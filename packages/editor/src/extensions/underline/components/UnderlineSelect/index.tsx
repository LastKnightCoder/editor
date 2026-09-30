import { memo } from "react";
import { INLINE_PALETTE, getInlinePaletteEntry, inlineInk } from "../../../../constants";
import { PanelGroup, Swatch, inlineStylePanelClass } from "../../../../components/InlineStylePanel";
import { getUnderlineColor } from "../../colors";

export type UnderlineLineType = "solid" | "dashed" | "dotted" | "wavy";

const LINE_TYPES: { value: UnderlineLineType; label: string }[] = [
  { value: "solid", label: "实线" },
  { value: "dashed", label: "虚线" },
  { value: "dotted", label: "点线" },
  { value: "wavy", label: "波浪线" },
];

interface IUnderlineSelectProps {
  selectedColor: string;
  selectedLineType: UnderlineLineType;
  onColorSelect: (color: string) => void;
  onLineTypeSelect: (lineType: UnderlineLineType) => void;
}

/** 下划线面板：颜色与统一色板同列同色（首格跟随文字），线型格直接画当前颜色的效果 */
const UnderlineSelect = memo((props: IUnderlineSelectProps) => {
  const { selectedColor, selectedLineType, onColorSelect, onLineTypeSelect } = props;
  const lineColor = getUnderlineColor(selectedColor);
  const colorLabel = getInlinePaletteEntry(selectedColor)?.label ?? "跟随文字";

  return (
    <div className={inlineStylePanelClass}>
      <PanelGroup label="颜色" value={colorLabel}>
        <Swatch
          label="跟随文字"
          active={!getInlinePaletteEntry(selectedColor)}
          onPick={() => onColorSelect("default")}
        >
          <span className="h-[3px] w-4 rounded-[2px] bg-[var(--ed-text)]" />
        </Swatch>
        {INLINE_PALETTE.map(entry => (
          <Swatch
            key={entry.id}
            label={entry.label}
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

      <PanelGroup label="线型">
        {LINE_TYPES.map(lineType => (
          <Swatch
            key={lineType.value}
            label={lineType.label}
            active={selectedLineType === lineType.value}
            onPick={() => onLineTypeSelect(lineType.value)}
            className="h-[34px] w-[60px]"
          >
            <span
              className="text-[13px] underline decoration-[1.5px] underline-offset-4"
              style={{ textDecorationStyle: lineType.value, textDecorationColor: lineColor }}
            >
              文字
            </span>
          </Swatch>
        ))}
      </PanelGroup>
    </div>
  );
});

export default UnderlineSelect;
