import { useEditorI18n } from "../../../../../i18n";
import { getInlinePaletteEntry } from "../../inline-palette.ts";
import { Swatch, inlineStylePanelClass } from "../InlineStylePanel/index.tsx";

interface ColorSelectProps<ColorType extends string> {
  colors: Array<{
    label: ColorType;
    color: string;
  }>;
  selectColor: string;
  onSelectColor: (color: ColorType) => void;
}

/** 单行色块选择（样式文本等）：外观同悬浮工具条子面板 */
const ColorSelect = <ColorType extends string>(props: ColorSelectProps<ColorType>) => {
  const { t } = useEditorI18n();
  const { selectColor, onSelectColor, colors } = props;

  return (
    <div className={inlineStylePanelClass}>
      <div className="flex gap-1">
        {colors.map(({ label, color }) => {
          const entry = getInlinePaletteEntry(label);
          return (
            <Swatch
              key={label}
              label={entry ? t(`palette.${entry.id}`) : label}
              active={label === selectColor}
              onPick={() => onSelectColor(label)}
            >
              <span className="h-4 w-4 rounded-[5px]" style={{ backgroundColor: color }} />
            </Swatch>
          );
        })}
      </div>
    </div>
  );
};

export default ColorSelect;
