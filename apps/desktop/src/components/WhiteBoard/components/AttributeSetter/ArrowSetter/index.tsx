import { produce } from "immer";
import { Waves } from "lucide-react";

import useTheme from "@/hooks/useTheme";
import Arrow from "../../Arrow";
import { ArrowElement, EArrowLineType, EMarkerType } from "../../../types";
import { getArrowDisplayColor } from "../../../utils/color";
import { saveArrowStylePresetFromElement } from "../../../utils";
import { THEME_COLORS, getDefaultThemeColorId } from "../../../constants/theme-colors";
import { AttrPopover, AttrToggle, Field, OptionGrid, Slider, SwatchRow } from "../../../chrome";
import { DashIcon, LineWidthIcon, MarkerEndIcon, MarkerStartIcon } from "../../../chrome/icons";
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

const ArrowSetter = ({ element, onChange }: ArrowSetterProps) => {
  const { isDark } = useTheme();
  const set = (recipe: (draft: ArrowElement) => void) => {
    const next = produce(element, recipe);
    saveArrowStylePresetFromElement(next);
    onChange(next);
  };

  const color = getArrowDisplayColor(element, isDark);
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
      <AttrPopover label="起点箭头" icon={<MarkerStartIcon />} width={264}>
        <OptionGrid
          options={MARKERS.map(m => ({
            value: m.type,
            label: m.label,
            glyph: <ArrowGlyph source={m.type} />,
          }))}
          value={element.source.marker}
          onChange={v => set(d => void (d.source.marker = v))}
        />
      </AttrPopover>
      <AttrPopover label="终点箭头" icon={<MarkerEndIcon />} width={264}>
        <OptionGrid
          options={MARKERS.map(m => ({
            value: m.type,
            label: m.label,
            glyph: <ArrowGlyph target={m.type} />,
          }))}
          value={element.target.marker}
          onChange={v => set(d => void (d.target.marker = v))}
        />
      </AttrPopover>
      <AttrPopover label="颜色" swatch={{ fill: color, stroke: color }} width={264}>
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
      </AttrPopover>
      <AttrPopover label="粗细" icon={<LineWidthIcon />} width={240}>
        <Slider
          label="粗细"
          min={1}
          max={10}
          unit="px"
          value={element.lineWidth || 2}
          onChange={v => set(d => void (d.lineWidth = v))}
        />
      </AttrPopover>
      <AttrPopover
        label="虚线"
        icon={<DashIcon />}
        width={264}
        toggle={{ checked: !!element.dashed, onChange: v => set(d => void (d.dashed = v)) }}
      >
        {element.dashed && (
          <OptionGrid
            options={DASH_PATTERNS.map(p => ({
              value: p.value.join(","),
              label: p.label,
              glyph: (
                <svg className="g" viewBox="0 0 28 14" aria-hidden>
                  <path d="M2 7H26" strokeDasharray={p.value.map(v => v * 0.6).join(" ")} />
                </svg>
              ),
            }))}
            value={dashKey}
            onChange={v => set(d => void (d.dashArray = v.split(",").map(Number)))}
          />
        )}
      </AttrPopover>
      {element.animated ? (
        <AttrPopover
          label="流动动画"
          icon={<Waves strokeWidth={1.75} />}
          width={240}
          toggle={{ checked: true, onChange: v => set(d => void (d.animated = v)) }}
        >
          <Field label="动画速度">
            <Slider
              label="动画速度"
              min={1}
              max={10}
              value={element.animationSpeed || 3}
              onChange={v => set(d => void (d.animationSpeed = v))}
            />
            <div className="text-ink-3 mt-1 flex justify-between text-[11px]">
              <span>慢</span>
              <span>中</span>
              <span>快</span>
            </div>
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
