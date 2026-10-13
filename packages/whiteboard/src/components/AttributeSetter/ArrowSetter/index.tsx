import { produce } from "immer";
import { Waves } from "lucide-react";

import useTheme from "../../../hooks/useTheme";
import Arrow from "../../Arrow";
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

const LINE_TYPES = [
  { label: "直线", type: EArrowLineType.STRAIGHT },
  { label: "曲线", type: EArrowLineType.CURVE },
  { label: "正交线", type: EArrowLineType.ORTHOGONAL },
] as const;

const MARKERS = [
  { label: "无箭头", type: EMarkerType.None },
  { label: "标准箭头", type: EMarkerType.Arrow },
  { label: "开放式箭头", type: EMarkerType.OpenArrow },
  { label: "闭合式箭头", type: EMarkerType.ClosedArrow },
  { label: "菱形箭头", type: EMarkerType.Diamond },
  { label: "圆形箭头", type: EMarkerType.Circle },
] as const;

const DASH_PATTERNS = [
  { label: "标准虚线", value: [5, 5] },
  { label: "点线", value: [2, 2] },
  { label: "长虚线", value: [10, 5] },
  { label: "点划线", value: [10, 3, 2, 3] },
  { label: "密集虚线", value: [3, 3] },
];

const LINE_WIDTH_OPTIONS: OptionItem<string>[] = [
  { value: "1", label: "细", glyph: <LineWeightGlyph width={1} /> },
  { value: "2", label: "标准", glyph: <LineWeightGlyph width={2} /> },
  { value: "4", label: "粗", glyph: <LineWeightGlyph width={4} /> },
  { value: "6", label: "特粗", glyph: <LineWeightGlyph width={6} /> },
];

/** 线条档：实线 + 原虚线 5 档，value 复用原 dashArray key */
const LINE_STYLE_OPTIONS: OptionItem<string>[] = [
  {
    value: "solid",
    label: "实线",
    glyph: (
      <Glyph>
        <path d="M2 7H26" />
      </Glyph>
    ),
  },
  ...DASH_PATTERNS.map(p => ({
    value: p.value.join(","),
    label: p.label,
    glyph: (
      <Glyph>
        <path d="M2 7H26" strokeDasharray={p.value.map(v => v * 0.6).join(" ")} />
      </Glyph>
    ),
  })),
];

const SPEED_OPTIONS: OptionItem<string>[] = [
  { value: "1", label: "慢" },
  { value: "3", label: "中" },
  { value: "6", label: "快" },
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
    <svg className="size-5 overflow-visible" viewBox="0 0 1024 1024" aria-hidden>
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
    </svg>
  );
}

/** 端点弹层里的单侧箭头档位（起点 / 终点共用选项与图示） */
function markerGrid(
  end: "source" | "target",
  marker: EMarkerType,
  onChange: (v: EMarkerType) => void
) {
  return (
    <OptionGrid
      options={MARKERS.map(m => ({
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
      <AttrPopover label="线型" icon={<ArrowGlyph lineType={element.lineType} />} width={264}>
        <OptionGrid
          options={LINE_TYPES.map(t => ({
            value: t.type,
            label: t.label,
            glyph: <ArrowGlyph lineType={t.type} />,
            showLabel: true,
          }))}
          value={element.lineType}
          onChange={v => set(d => void (d.lineType = v))}
        />
      </AttrPopover>
      <AttrPopover label="端点" icon={<MarkerEndIcon />} width={264}>
        <Field label="起点">
          {markerGrid("source", element.source.marker, v => set(d => void (d.source.marker = v)))}
        </Field>
        <Field label="终点">
          {markerGrid("target", element.target.marker, v => set(d => void (d.target.marker = v)))}
        </Field>
      </AttrPopover>
      <AttrPopover label="样式" swatch={{ fill: color, stroke: color }} width={288}>
        <Field label="颜色">
          {/* 主题色随深浅色模式取对应色值（数据色，保留现状 12 色） */}
          <SwatchRow
            options={THEME_COLORS.map(c => ({
              key: c.id,
              label: c.label,
              fill: isDark ? c.dark : c.light,
              stroke: isDark ? c.dark : c.light,
            }))}
            value={element.themeColorId || getDefaultThemeColorId()}
            onChange={id => set(d => void (d.themeColorId = id))}
          />
          <div className="text-ink-3 mt-2.5 text-[11px]">主题颜色会随深浅色模式自动调整</div>
        </Field>
        <Field
          label="粗细"
          value={
            <Stepper
              label="粗细"
              min={1}
              max={10}
              step={1}
              value={lineWidth}
              onChange={v => set(d => void (d.lineWidth = v))}
            />
          }
        >
          <OptionGrid
            options={LINE_WIDTH_OPTIONS}
            value={gridValue(LINE_WIDTH_OPTIONS, lineWidth)}
            onChange={v => set(d => void (d.lineWidth = Number(v)))}
          />
        </Field>
        <Field label="线条">
          <OptionGrid
            cols={6}
            options={LINE_STYLE_OPTIONS}
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
          label="流动动画"
          icon={<Waves strokeWidth={1.75} />}
          width={240}
          toggle={{ checked: true, onChange: v => set(d => void (d.animated = v)) }}
        >
          <Field label="速度">
            <OptionGrid
              options={SPEED_OPTIONS}
              value={gridValue(SPEED_OPTIONS, animationSpeed)}
              onChange={v => set(d => void (d.animationSpeed = Number(v)))}
            />
            <div className="text-ink-3 mt-1.5 text-[11px]">
              {element.dashed ? "虚线将显示流动效果" : "实线将显示流动点"}
            </div>
          </Field>
        </AttrPopover>
      ) : (
        <AttrToggle
          label="流动动画"
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
