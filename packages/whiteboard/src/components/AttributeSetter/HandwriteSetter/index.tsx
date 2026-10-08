import { memo } from "react";
import { useMemoizedFn } from "ahooks";
import { Blend, Gauge, SlidersHorizontal } from "lucide-react";

import useTheme from "../../../hooks/useTheme";
import {
  getDefaultHandwriteStyle,
  rebuildHandwriteGeometry,
  saveHandwriteStyle,
} from "../../../utils";
import { THEME_COLORS, getDefaultThemeColorId } from "../../../constants/theme-colors";
import type { HandwriteElement } from "../../../plugins/HandwritePlugin";
import { AttrPopover, AttrToggle, Field, Slider, SwatchRow } from "../../../chrome";
import { LineWidthIcon } from "../../../chrome/icons";

interface HandwriteSetterProps {
  element: HandwriteElement;
  onChange: (element: HandwriteElement) => void;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

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
      <AttrPopover label="颜色" swatch={{ fill: colorValue, stroke: colorValue }} width={264}>
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
      </AttrPopover>
      <AttrPopover label="线宽" icon={<LineWidthIcon />} width={240}>
        <Slider
          label="线宽"
          min={1}
          max={64}
          unit="px"
          value={currentStyle.size}
          onChange={v => updateStyle({ size: v })}
        />
      </AttrPopover>
      <AttrPopover label="透明度" icon={<Blend strokeWidth={1.75} />} width={240}>
        <Slider
          label="透明度"
          min={0.1}
          max={1}
          step={0.05}
          value={currentStyle.opacity}
          format={pct}
          onChange={v => updateStyle({ opacity: v })}
        />
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
