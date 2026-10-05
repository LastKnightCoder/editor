import { memo } from "react";
import { useMemoizedFn } from "ahooks";
import { Captions } from "lucide-react";
import { produce } from "immer";
import { ImageElement } from "../../../types";
import {
  DEFAULT_DESCRIPTION_ALIGNMENT,
  DEFAULT_DESCRIPTION_POSITION,
  EDescriptionPosition,
  EDescriptionAlignment,
} from "../../../constants/image";
import { EShadowSize, SHADOW_SIZE_OPTIONS, getShadowStyle } from "../../../constants";
import { ImageUtil } from "../../../utils";
import useTheme from "@/hooks/useTheme";
import { AttrPopover, Field, OptionGrid, Seg, SwatchRow } from "../../../chrome";
import { ShadowIcon } from "../../../chrome/icons";
import SketchPopover from "../SketchPopover";

interface ImageSetterProps {
  element: ImageElement;
  onChange: (element: ImageElement) => void;
}

interface DescriptionColor {
  backgroundColor: string;
  borderColor: string;
  color: string;
}

const DESCRIPTION_COLORS: DescriptionColor[] = [
  {
    backgroundColor: "transparent",
    borderColor: "transparent",
    color: "currentColor",
  },
  {
    backgroundColor: "rgba(59, 130, 246, 0.1)",
    borderColor: "#3b82f6",
    color: "currentColor",
  },
  {
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    borderColor: "#10b981",
    color: "currentColor",
  },
  {
    backgroundColor: "rgba(253, 224, 71, 0.15)",
    borderColor: "#fde047",
    color: "currentColor",
  },
  {
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    borderColor: "#f59e0b",
    color: "currentColor",
  },
  {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderColor: "#ef4444",
    color: "currentColor",
  },
  {
    backgroundColor: "rgba(139, 92, 246, 0.1)",
    borderColor: "#8b5cf6",
    color: "currentColor",
  },
  {
    backgroundColor: "rgba(107, 114, 128, 0.1)",
    borderColor: "#6b7280",
    color: "currentColor",
  },
];

const COLOR_NAMES = ["无", "蓝", "绿", "黄", "橙", "红", "紫", "灰"];
const colorKey = (c: { backgroundColor?: string; borderColor?: string }) =>
  `${c.backgroundColor ?? "transparent"}|${c.borderColor ?? "transparent"}`;

const ImageSetter = memo((props: ImageSetterProps) => {
  const { element, onChange } = props;
  const { isDark } = useTheme();
  const { showDescription = false } = element;
  const set = (recipe: (draft: ImageElement) => void) => onChange(produce(element, recipe));

  const handleShadowSizeChange = useMemoizedFn((size: EShadowSize) => {
    set(draft => void (draft.shadowSize = size));
    ImageUtil.setLocalStorage("shadowSize", size);
  });
  const handleOnSelectColor = useMemoizedFn((key: string) => {
    const color = DESCRIPTION_COLORS.find(c => colorKey(c) === key);
    if (!color) return;
    set(draft => {
      if (!draft.descriptionStyle) draft.descriptionStyle = {};
      draft.descriptionStyle.backgroundColor = color.backgroundColor;
      draft.descriptionStyle.borderColor = color.borderColor;
      draft.descriptionStyle.color = color.color;
    });
  });

  return (
    <>
      <AttrPopover label="阴影" icon={<ShadowIcon />} width={220}>
        <OptionGrid
          options={SHADOW_SIZE_OPTIONS.map(o => ({
            value: o.value,
            label: o.label,
            showLabel: true,
            glyph: (
              <span
                aria-hidden
                className="bg-surface ring-line-1 block size-[18px] flex-none rounded-[4px] ring-1"
                style={{ boxShadow: getShadowStyle(o.value, isDark) }}
              />
            ),
          }))}
          value={element.shadowSize ?? EShadowSize.None}
          onChange={handleShadowSizeChange}
        />
      </AttrPopover>
      <AttrPopover
        label="描述"
        icon={<Captions strokeWidth={1.75} />}
        width={260}
        toggle={{ checked: showDescription, onChange: v => set(d => void (d.showDescription = v)) }}
      >
        {showDescription && (
          <>
            <Field label="位置">
              <Seg<EDescriptionPosition>
                label="描述位置"
                value={element.descriptionPosition ?? DEFAULT_DESCRIPTION_POSITION}
                onChange={v => set(d => void (d.descriptionPosition = v))}
                options={[
                  { value: EDescriptionPosition.TOP, label: "上方" },
                  { value: EDescriptionPosition.BOTTOM, label: "下方" },
                ]}
              />
            </Field>
            <Field label="对齐">
              <Seg<EDescriptionAlignment>
                label="描述对齐"
                value={element.descriptionAlignment ?? DEFAULT_DESCRIPTION_ALIGNMENT}
                onChange={v => set(d => void (d.descriptionAlignment = v))}
                options={[
                  { value: EDescriptionAlignment.LEFT, label: "左对齐" },
                  { value: EDescriptionAlignment.CENTER, label: "居中" },
                  { value: EDescriptionAlignment.RIGHT, label: "右对齐" },
                ]}
              />
            </Field>
            <Field label="背景">
              <SwatchRow
                options={DESCRIPTION_COLORS.map((c, i) => ({
                  key: colorKey(c),
                  label: COLOR_NAMES[i] ?? "",
                  fill: c.backgroundColor,
                  stroke: c.borderColor,
                  kind: c.backgroundColor === "transparent" ? "none" : undefined,
                }))}
                value={colorKey(element.descriptionStyle ?? {})}
                onChange={handleOnSelectColor}
              />
            </Field>
          </>
        )}
      </AttrPopover>
      <SketchPopover target={element} onChange={onChange} />
    </>
  );
});

export default ImageSetter;
