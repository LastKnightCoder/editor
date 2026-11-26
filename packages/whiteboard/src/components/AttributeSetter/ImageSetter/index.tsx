import { attributeOption } from "../../../attribute-labels";
import { useAttributeI18n, type AttributeTranslate } from "../../../attributes-i18n";
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
import useTheme from "../../../hooks/useTheme";
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

const COLOR_NAMES = (t: AttributeTranslate) => [
  t("attributes.none"),
  t("attributes.color.blue"),
  t("attributes.color.green"),
  t("attributes.color.yellow"),
  t("attributes.color.orange"),
  t("attributes.color.red"),
  t("attributes.color.purple"),
  t("attributes.color.gray"),
];
const colorKey = (c: { backgroundColor?: string; borderColor?: string }) =>
  `${c.backgroundColor ?? "transparent"}|${c.borderColor ?? "transparent"}`;

const ImageSetter = memo((props: ImageSetterProps) => {
  const { t } = useAttributeI18n();
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
      <AttrPopover label={t("attributes.shadow")} icon={<ShadowIcon />} width={220}>
        <OptionGrid
          options={SHADOW_SIZE_OPTIONS.map(o => ({
            value: o.value,
            label: attributeOption("shadow", o.value, o.label, t),
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
        label={t("attributes.description")}
        icon={<Captions strokeWidth={1.75} />}
        width={260}
        toggle={{ checked: showDescription, onChange: v => set(d => void (d.showDescription = v)) }}
      >
        {showDescription && (
          <>
            <Field label={t("attributes.position")}>
              <Seg<EDescriptionPosition>
                label={t("attributes.description.position")}
                value={element.descriptionPosition ?? DEFAULT_DESCRIPTION_POSITION}
                onChange={v => set(d => void (d.descriptionPosition = v))}
                options={[
                  { value: EDescriptionPosition.TOP, label: t("attributes.top") },
                  { value: EDescriptionPosition.BOTTOM, label: t("attributes.bottom") },
                ]}
              />
            </Field>
            <Field label={t("attributes.align")}>
              <Seg<EDescriptionAlignment>
                label={t("attributes.description.align")}
                value={element.descriptionAlignment ?? DEFAULT_DESCRIPTION_ALIGNMENT}
                onChange={v => set(d => void (d.descriptionAlignment = v))}
                options={[
                  { value: EDescriptionAlignment.LEFT, label: t("attributes.align.left") },
                  { value: EDescriptionAlignment.CENTER, label: t("attributes.align.center") },
                  { value: EDescriptionAlignment.RIGHT, label: t("attributes.align.right") },
                ]}
              />
            </Field>
            <Field label={t("attributes.background")}>
              <SwatchRow
                options={DESCRIPTION_COLORS.map((c, i) => ({
                  key: colorKey(c),
                  label: COLOR_NAMES(t)[i] ?? "",
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
