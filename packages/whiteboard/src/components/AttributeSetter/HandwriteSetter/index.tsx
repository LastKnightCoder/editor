import { memo } from "react";
import { useMemoizedFn } from "ahooks";
import { Gauge, SlidersHorizontal } from "lucide-react";

import useTheme from "../../../hooks/useTheme";
import {
  getDefaultHandwriteStyle,
  rebuildHandwriteGeometry,
  saveHandwriteStyle,
} from "../../../utils";
import { THEME_COLORS, getDefaultThemeColorId } from "../../../constants/theme-colors";
import type { HandwriteElement } from "../../../plugins/HandwritePlugin";
import {
  AttrPopover,
  AttrToggle,
  Field,
  LineWeightGlyph,
  OpacityGlyph,
  OptionGrid,
  Slider,
  Stepper,
  SwatchRow,
  type OptionItem,
} from "../../../chrome";

interface HandwriteSetterProps {
  element: HandwriteElement;
  onChange: (element: HandwriteElement) => void;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

const SIZE_OPTIONS: OptionItem<string>[] = [
  // 笔迹线宽跨度大（默认 8），图示按 1/4 缩放，避免粗档都顶到图示 8px 封顶
  { value: "4", label: "细", glyph: <LineWeightGlyph width={1} /> },
  { value: "8", label: "标准", glyph: <LineWeightGlyph width={2} /> },
  { value: "16", label: "粗", glyph: <LineWeightGlyph width={4} /> },
  { value: "32", label: "特粗", glyph: <LineWeightGlyph width={8} /> },
];

const OPACITY_OPTIONS: OptionItem<string>[] = [25, 50, 75, 100].map(n => ({
  value: String(n),
  label: `${n}%`,
  glyph: <OpacityGlyph opacity={n / 100} />,
  showLabel: true,
}));

/** 不透明度在弹层内按百分比整数展示与档位匹配 */
const toOpacityPct = (opacity: number) => Math.round(opacity * 100);
/** 写回 0–1 值保留两位小数，避免百分比换算的浮点残渣 */
const fromOpacityPct = (value: number) => Number((value / 100).toFixed(2));

const gridValue = (options: OptionItem<string>[], value: number): string | null =>
  options.some(o => o.value === String(value)) ? String(value) : null;

const HandwriteSetter = memo(({ element, onChange }: HandwriteSetterProps) => {
  const { isDark } = useTheme();
  const currentStyle = { ...getDefaultHandwriteStyle(), ...element.style };

  const updateStyle = useMemoizedFn((patch: Partial<typeof currentStyle>) => {
    const nextStyle = { ...currentStyle, ...patch };
    const rebuilt = rebuildHandwriteGeometry(
      element.points,
      { x: element.x, y: element.y, width: element.width, height: element.height },
      nextStyle
    );
    if (!rebuilt) return;
    saveHandwriteStyle(nextStyle);
    onChange({ ...element, ...rebuilt, style: nextStyle });
  });

  const colorId = currentStyle.themeColorId || getDefaultThemeColorId();
  const color = THEME_COLORS.find(c => c.id === colorId);
  const colorValue = color ? (isDark ? color.dark : color.light) : "var(--tau-ink-1)";

  return (
    <>
      <AttrPopover label="样式" swatch={{ fill: colorValue, stroke: colorValue }} width={288}>
        <Field label="颜色">
          <SwatchRow
            options={THEME_COLORS.map(c => ({
              key: c.id,
              label: c.label,
              fill: isDark ? c.dark : c.light,
              stroke: isDark ? c.dark : c.light,
            }))}
            value={colorId}
            onChange={id => updateStyle({ themeColorId: id })}
          />
          <div className="text-ink-3 mt-2.5 text-[11px]">主题颜色会随深浅色模式自动调整</div>
        </Field>
        <Field
          label="粗细"
          value={
            <Stepper
              label="粗细"
              min={1}
              max={64}
              step={1}
              value={currentStyle.size}
              onChange={v => updateStyle({ size: v })}
            />
          }
        >
          <OptionGrid
            options={SIZE_OPTIONS}
            value={gridValue(SIZE_OPTIONS, currentStyle.size)}
            onChange={v => updateStyle({ size: Number(v) })}
          />
        </Field>
        <Field
          label="不透明度"
          value={
            <Stepper
              label="不透明度"
              min={10}
              max={100}
              step={5}
              unit="%"
              value={toOpacityPct(currentStyle.opacity)}
              onChange={v => updateStyle({ opacity: fromOpacityPct(v) })}
            />
          }
        >
          <OptionGrid
            options={OPACITY_OPTIONS}
            value={gridValue(OPACITY_OPTIONS, toOpacityPct(currentStyle.opacity))}
            onChange={v => updateStyle({ opacity: fromOpacityPct(Number(v)) })}
          />
        </Field>
      </AttrPopover>
      <AttrPopover label="笔刷参数" icon={<SlidersHorizontal strokeWidth={1.75} />} width={248}>
        <Field label="细化">
          <Slider
            label="细化"
            min={0}
            max={1}
            step={0.01}
            value={currentStyle.thinning}
            format={pct}
            onChange={v => updateStyle({ thinning: v })}
          />
        </Field>
        <Field label="平滑">
          <Slider
            label="平滑"
            min={0}
            max={1}
            step={0.01}
            value={currentStyle.smoothing}
            format={pct}
            onChange={v => updateStyle({ smoothing: v })}
          />
        </Field>
        <Field label="跟随">
          <Slider
            label="跟随"
            min={0}
            max={1}
            step={0.01}
            value={currentStyle.streamline}
            format={pct}
            onChange={v => updateStyle({ streamline: v })}
          />
        </Field>
      </AttrPopover>
      <AttrToggle
        label="压感模拟"
        icon={<Gauge strokeWidth={1.75} />}
        checked={!!currentStyle.simulatePressure}
        onChange={v => updateStyle({ simulatePressure: v })}
      />
    </>
  );
});

HandwriteSetter.displayName = "HandwriteSetter";

export default HandwriteSetter;
