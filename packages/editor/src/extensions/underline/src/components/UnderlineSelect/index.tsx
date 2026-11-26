import { useEditorI18n } from "../../../../../i18n";
import { memo } from "react";
import { Eraser } from "lucide-react";
import { cn } from "@tau/ui";
import { EditorTooltip as Tooltip } from "@tau/editor/api";
import {
  INLINE_PALETTE,
  getInlinePaletteEntry,
  inlineInk,
} from "@tau/editor/extensions/text-formatting/palette";
import { PanelAction, inlineStylePanelClass } from "@tau/editor/extensions/text-formatting/panels";
import { getUnderlineColor } from "../../colors.ts";

export type UnderlineLineType = "solid" | "dashed" | "dotted" | "wavy";

const LINE_TYPES: UnderlineLineType[] = ["solid", "dashed", "dotted", "wavy"];

const DOT_EDGE = "color-mix(in srgb, var(--ed-text) 14%, transparent)";

interface IUnderlineSelectProps {
  selectedColor: string;
  selectedLineType: UnderlineLineType;
  canRemove?: boolean;
  onColorSelect: (color: string) => void;
  onLineTypeSelect: (lineType: UnderlineLineType) => void;
  onRemove?: () => void;
}

const UnderlineLineGlyph = ({
  lineType,
  color,
}: {
  lineType: UnderlineLineType;
  color: string;
}) => (
  <svg width={34} height={10} viewBox="0 0 34 10" fill="none" aria-hidden="true" style={{ color }}>
    {lineType === "solid" && (
      <line
        x1="2"
        y1="5"
        x2="32"
        y2="5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    )}
    {lineType === "dashed" && (
      <line
        x1="2"
        y1="5"
        x2="32"
        y2="5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="5.5 4.5"
      />
    )}
    {lineType === "dotted" && (
      <line
        x1="2.5"
        y1="5"
        x2="31.5"
        y2="5"
        stroke="currentColor"
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeDasharray="0.1 4.8"
      />
    )}
    {lineType === "wavy" && (
      <path
        d="M 2 5 Q 5 2.4, 8 5 T 14 5 T 20 5 T 26 5 T 32 5"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    )}
  </svg>
);

interface ColorDotProps {
  label: string;
  color: string;
  active: boolean;
  onPick: () => void;
}

/** 色点用纸底留白 + 同色外环标出当前值，避免主题 accent 框与所选色相冲突 */
const ColorDot = ({ label, color, active, onPick }: ColorDotProps) => (
  <Tooltip content={label} placement="bottom">
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onMouseDown={event => event.preventDefault()}
      onClick={event => {
        event.preventDefault();
        event.stopPropagation();
        onPick();
      }}
      className="flex size-7 cursor-pointer items-center justify-center rounded-full border-none bg-transparent p-0 transition-colors duration-150 hover:bg-[var(--ed-bg-hover)]"
    >
      <span
        className={cn(
          "rounded-full transition-[width,height,box-shadow] duration-150",
          active ? "size-3.5" : "size-4"
        )}
        style={{
          backgroundColor: color,
          boxShadow: active
            ? `inset 0 0 0 0.5px ${DOT_EDGE}, 0 0 0 2px var(--ed-bg-surface), 0 0 0 3.5px ${color}`
            : `inset 0 0 0 1px ${DOT_EDGE}`,
        }}
      />
    </button>
  </Tooltip>
);

/** 下划线面板：色点双环选色 + 分段 SVG 线型槽，上下同宽对齐 */
const UnderlineSelect = memo((props: IUnderlineSelectProps) => {
  const { t } = useEditorI18n();
  const { selectedColor, selectedLineType, canRemove, onColorSelect, onLineTypeSelect, onRemove } =
    props;
  const lineColor = getUnderlineColor(selectedColor);
  const colorEntry = getInlinePaletteEntry(selectedColor);
  const colorLabel = colorEntry ? t(`palette.${colorEntry.id}`) : t("underline.inherit");
  const lineTypeLabel = t(`underline.${selectedLineType}`);

  return (
    <div className={cn(inlineStylePanelClass, "w-[264px] p-3")}>
      <div>
        <div className="flex items-center justify-between px-0.5 pb-2 text-[11.5px] font-medium text-[var(--ed-text-tertiary)]">
          <span>{t("underline.color")}</span>
          <span className="font-normal text-[var(--ed-text-secondary)]">{colorLabel}</span>
        </div>
        <div className="grid grid-cols-8 place-items-center gap-0.5">
          <ColorDot
            label={t("underline.inherit")}
            color="var(--ed-text)"
            active={!colorEntry}
            onPick={() => onColorSelect("default")}
          />
          {INLINE_PALETTE.map(entry => (
            <ColorDot
              key={entry.id}
              label={t(`palette.${entry.id}`)}
              color={inlineInk(entry.id) ?? "var(--ed-text)"}
              active={selectedColor === entry.id}
              onPick={() => onColorSelect(entry.id)}
            />
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between px-0.5 pb-2 text-[11.5px] font-medium text-[var(--ed-text-tertiary)]">
          <span>{t("underline.type")}</span>
          <span className="font-normal text-[var(--ed-text-secondary)]">{lineTypeLabel}</span>
        </div>
        <div className="grid w-full grid-cols-4 gap-[3px] rounded-[10px] bg-[var(--ed-bg-hover)] p-[3px]">
          {LINE_TYPES.map(lineType => {
            const active = selectedLineType === lineType;
            const label = t(`underline.${lineType}`);
            return (
              <Tooltip key={lineType} content={label} placement="bottom">
                <button
                  type="button"
                  aria-label={label}
                  aria-pressed={active}
                  onMouseDown={event => event.preventDefault()}
                  onClick={event => {
                    event.preventDefault();
                    event.stopPropagation();
                    onLineTypeSelect(lineType);
                  }}
                  className={cn(
                    "flex h-[30px] cursor-pointer items-center justify-center rounded-[7.5px] border-none bg-transparent p-0 text-[var(--ed-text)] transition-[background-color,box-shadow] duration-150",
                    active
                      ? "bg-[var(--ed-bg-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.10),0_0_0_1px_var(--ed-border)]"
                      : "hover:bg-[var(--ed-bg-hover)]"
                  )}
                >
                  <UnderlineLineGlyph lineType={lineType} color={lineColor} />
                </button>
              </Tooltip>
            );
          })}
        </div>
      </div>

      {canRemove && onRemove && (
        <PanelAction icon={<Eraser />} onClick={onRemove}>
          {t("underline.remove")}
        </PanelAction>
      )}
    </div>
  );
});

export default UnderlineSelect;
