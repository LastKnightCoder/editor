import { attributeColor } from "../../../attribute-labels";
import { useAttributeI18n, type AttributeTranslate } from "../../../attributes-i18n";
import { produce } from "immer";
import { Waves } from "lucide-react";

import useTheme from "../../../hooks/useTheme";
import Arrow from "../../Arrow";
import { ArrowMarkerSvg } from "../../ArrowMarkers";
import { ArrowElement, EArrowLineType, EMarkerType } from "../../../types";
import { getArrowDisplayColor } from "../../../utils/color";
import { saveArrowStylePresetFromElement } from "../../../utils";
import { THEME_COLORS, getDefaultThemeColorId } from "../../../constants/theme-colors";
import {
  AttrPopover,
  AttrToggle,
  Field,
  Glyph,
  LineWeightGlyph,
  OptionGrid,
  Stepper,
  SwatchRow,
  type OptionItem,
} from "../../../chrome";
import { MarkerEndIcon } from "../../../chrome/icons";
import SketchPopover from "../SketchPopover";

interface ArrowSetterProps {
  element: ArrowElement;
  onChange: (element: ArrowElement) => void;
}

const LINE_TYPES = (t: AttributeTranslate) =>
  [
    { label: t("attributes.line.straight"), type: EArrowLineType.STRAIGHT },
    { label: t("attributes.line.curve"), type: EArrowLineType.CURVE },
    { label: t("attributes.line.orthogonal"), type: EArrowLineType.ORTHOGONAL },
  ] as const;

const MARKERS = (t: AttributeTranslate) =>
  [
    { label: t("attributes.marker.none"), type: EMarkerType.None },
    { label: t("attributes.marker.standard"), type: EMarkerType.Arrow },
    { label: t("attributes.marker.open"), type: EMarkerType.OpenArrow },
    { label: t("attributes.marker.closed"), type: EMarkerType.ClosedArrow },
    { label: t("attributes.marker.diamond"), type: EMarkerType.Diamond },
    { label: t("attributes.marker.circle"), type: EMarkerType.Circle },
  ] as const;

const DASH_PATTERNS = (t: AttributeTranslate) => [
  { label: t("attributes.dash.standard"), value: [5, 5] },
  { label: t("attributes.dottedLine"), value: [2, 2] },
  { label: t("attributes.dash.long"), value: [10, 5] },
  { label: t("attributes.dash.dotDash"), value: [10, 3, 2, 3] },
  { label: t("attributes.dash.dense"), value: [3, 3] },
];

const LINE_WIDTH_OPTIONS = (t: AttributeTranslate): OptionItem<string>[] => [
  { value: "1", label: t("attributes.thin"), glyph: <LineWeightGlyph width={1} /> },
  { value: "2", label: t("attributes.standard"), glyph: <LineWeightGlyph width={2} /> },
  { value: "4", label: t("attributes.thick"), glyph: <LineWeightGlyph width={4} /> },
  { value: "6", label: t("attributes.extraThick"), glyph: <LineWeightGlyph width={6} /> },
];

/** 线条档：实线 + 原虚线 5 档，value 复用原 dashArray key */
const LINE_STYLE_OPTIONS = (t: AttributeTranslate): OptionItem<string>[] => [
  {
    value: "solid",
    label: t("attributes.solidLine"),
    glyph: (
      <Glyph>
        <path d="M2 7H26" />
      </Glyph>
    ),
  },
  ...DASH_PATTERNS(t).map(p => ({
    value: p.value.join(","),
    label: p.label,
    glyph: (
      <Glyph>
        <path d="M2 7H26" strokeDasharray={p.value.map(v => v * 0.6).join(" ")} />
      </Glyph>
    ),
  })),
];

const SPEED_OPTIONS = (t: AttributeTranslate): OptionItem<string>[] => [
  { value: "1", label: t("attributes.slow") },
  { value: "3", label: t("attributes.medium") },
  { value: "6", label: t("attributes.fast") },
];

/** 图示：直接用画布的 Arrow 画法，墨色随 currentColor */
function ArrowGlyph({
  lineType = EArrowLineType.STRAIGHT,
  source = EMarkerType.None,
  target = EMarkerType.None,
}: {
  lineType?: EArrowLineType;
  source?: EMarkerType;
  target?: EMarkerType;
}) {
  return (
    <ArrowMarkerSvg className="size-5 overflow-visible" viewBox="0 0 1024 1024" aria-hidden>
      <Arrow
        sourceMarker={source}
        targetMarker={target}
        lineType={lineType}
        lineColor="currentColor"
        lineWidth={60}
        points={
          lineType !== EArrowLineType.STRAIGHT
            ? [
                { x: 80, y: 860 },
                { x: 944, y: 164 },
              ]
            : [
                { x: 60, y: 512 },
                { x: 964, y: 512 },
              ]
        }
      />
    </ArrowMarkerSvg>
  );
}

/** 端点弹层里的单侧箭头档位（起点 / 终点共用选项与图示） */
function markerGrid(
  end: "source" | "target",
  marker: EMarkerType,
  onChange: (v: EMarkerType) => void,
  t: AttributeTranslate
) {
  return (
    <OptionGrid
      options={MARKERS(t).map(m => ({
        value: m.type,
        label: m.label,
        glyph: end === "target" ? <ArrowGlyph target={m.type} /> : <ArrowGlyph source={m.type} />,
      }))}
      value={marker}
      onChange={onChange}
    />
  );
}

const gridValue = (options: OptionItem<string>[], value: number): string | null =>
  options.some(o => o.value === String(value)) ? String(value) : null;

const ArrowSetter = ({ element, onChange }: ArrowSetterProps) => {
  const { t } = useAttributeI18n();
  const { isDark } = useTheme();
  const set = (recipe: (draft: ArrowElement) => void) => {
    const next = produce(element, recipe);
    saveArrowStylePresetFromElement(next);
    onChange(next);
  };

  const color = getArrowDisplayColor(element, isDark);
  const lineWidth = element.lineWidth || 2;
  const animationSpeed = element.animationSpeed || 3;
  const dashKey = (element.dashArray ?? [5, 5]).join(",");

  return (
    <>
      <AttrPopover
        label={t("attributes.lineType")}
        icon={<ArrowGlyph lineType={element.lineType} />}
        width={264}
      >
        <OptionGrid
          options={LINE_TYPES(t).map(t => ({
            value: t.type,
            label: t.label,
            glyph: <ArrowGlyph lineType={t.type} />,
            showLabel: true,
          }))}
          value={element.lineType}
          onChange={v => set(d => void (d.lineType = v))}
        />
      </AttrPopover>
      <AttrPopover label={t("attributes.endpoints")} icon={<MarkerEndIcon />} width={264}>
        <Field label={t("attributes.start")}>
          {markerGrid(
            "source",
            element.source.marker,
            v => set(d => void (d.source.marker = v)),
            t
          )}
        </Field>
        <Field label={t("attributes.end")}>
          {markerGrid(
            "target",
            element.target.marker,
            v => set(d => void (d.target.marker = v)),
            t
          )}
        </Field>
      </AttrPopover>
      <AttrPopover
        label={t("attributes.style")}
        swatch={{ fill: color, stroke: color }}
        width={288}
      >
        <Field label={t("attributes.color")}>
          {/* 主题色随深浅色模式取对应色值（数据色，保留现状 12 色） */}
          <SwatchRow
            options={THEME_COLORS.map(c => ({
              key: c.id,
              label: attributeColor(c.id, c.label, t),
              fill: isDark ? c.dark : c.light,
              stroke: isDark ? c.dark : c.light,
            }))}
            value={element.themeColorId || getDefaultThemeColorId()}
            onChange={id => set(d => void (d.themeColorId = id))}
          />
          <div className="text-ink-3 mt-2.5 text-[11px]">{t("attributes.themeColorHint")}</div>
        </Field>
        <Field
          label={t("attributes.width")}
          value={
            <Stepper
              label={t("attributes.width")}
              min={1}
              max={10}
              step={1}
              value={lineWidth}
              onChange={v => set(d => void (d.lineWidth = v))}
            />
          }
        >
          <OptionGrid
            options={LINE_WIDTH_OPTIONS(t)}
            value={gridValue(LINE_WIDTH_OPTIONS(t), lineWidth)}
            onChange={v => set(d => void (d.lineWidth = Number(v)))}
          />
        </Field>
        <Field label={t("attributes.line")}>
          <OptionGrid
            cols={6}
            options={LINE_STYLE_OPTIONS(t)}
            value={element.dashed ? dashKey : "solid"}
            onChange={v =>
              set(d => {
                if (v === "solid") {
                  d.dashed = false;
                } else {
                  d.dashed = true;
                  d.dashArray = v.split(",").map(Number);
                }
              })
            }
          />
        </Field>
      </AttrPopover>
      {element.animated ? (
        <AttrPopover
          label={t("attributes.flow")}
          icon={<Waves strokeWidth={1.75} />}
          width={240}
          toggle={{ checked: true, onChange: v => set(d => void (d.animated = v)) }}
        >
          <Field label={t("attributes.speed")}>
            <OptionGrid
              options={SPEED_OPTIONS(t)}
              value={gridValue(SPEED_OPTIONS(t), animationSpeed)}
              onChange={v => set(d => void (d.animationSpeed = Number(v)))}
            />
            <div className="text-ink-3 mt-1.5 text-[11px]">
              {element.dashed ? t("attributes.flow.dashes") : t("attributes.flow.dots")}
            </div>
          </Field>
        </AttrPopover>
      ) : (
        <AttrToggle
          label={t("attributes.flow")}
          icon={<Waves strokeWidth={1.75} />}
          checked={false}
          onChange={v => set(d => void (d.animated = v))}
        />
      )}
      <SketchPopover target={element} onChange={onChange} />
    </>
  );
};

export default ArrowSetter;
