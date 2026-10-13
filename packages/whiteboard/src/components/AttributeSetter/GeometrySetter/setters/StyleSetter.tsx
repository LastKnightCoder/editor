import React from "react";
import { Palette } from "lucide-react";
import { produce } from "immer";
import { useMemoizedFn } from "ahooks";

import { GeometrySetterComponentProps } from "../IGeometrySetter";
import { BaseGeometrySetter } from "../BaseGeometrySetter";
import { GeometryUtil } from "../../../../utils";
import {
  AttrPopover,
  CornerGlyph,
  Field,
  LineWeightGlyph,
  OptionGrid,
  Seg,
  Stepper,
  SwatchRow,
  type OptionItem,
  type SwatchLook,
  type SwatchOption,
} from "../../../../chrome";
import type { GeometryElement } from "../../../../plugins";

export interface ColorOption {
  fill: string;
  stroke: string;
  color: string;
  theme?: "light" | "dark";
}

/** 填充方式：浅底 + 描边 / 实心 / 线框（仅描边） */
export type StyleMode = "soft" | "solid" | "outline";

const fillWithStrokeColors: ColorOption[] = [
  // 红色
  {
    fill: "#FFD0CE",
    stroke: "#FF6A63",
    color: "#000",
    theme: "light",
  },
  // 橙色
  {
    fill: "#FFCDAC",
    stroke: "#FB6C0C",
    color: "#000",
    theme: "light",
  },
  // 黄色
  {
    fill: "#FFE8BF",
    stroke: "#FFA02C",
    color: "#000",
    theme: "light",
  },
  // 绿色
  {
    fill: "#D6F2E9",
    stroke: "#24B079",
    color: "#000",
    theme: "light",
  },
  // 蓝色
  {
    fill: "#B8D9FF",
    stroke: "#3F71FB",
    color: "#000",
    theme: "light",
  },
  // 紫色
  {
    fill: "#E8E4FF",
    stroke: "#A67FFF",
    color: "#000",
    theme: "light",
  },
  // 粉色
  {
    fill: "#FFE6F2",
    stroke: "#F0569B",
    color: "#000",
    theme: "light",
  },
  // 灰色
  {
    fill: "#F2F2F2",
    stroke: "#808080",
    color: "#000",
    theme: "light",
  },
];

const fillWithoutStrokeColors: ColorOption[] = [
  {
    fill: "#FF6A63",
    stroke: "transparent",
    color: "#fff",
    theme: "dark",
  },
  {
    fill: "#FB6C0C",
    stroke: "transparent",
    color: "#fff",
    theme: "dark",
  },
  {
    fill: "#FFA02C",
    stroke: "transparent",
    color: "#fff",
    theme: "dark",
  },
  {
    fill: "#24B079",
    stroke: "transparent",
    color: "#fff",
    theme: "dark",
  },
  {
    fill: "#3F71FB",
    stroke: "transparent",
    color: "#fff",
    theme: "dark",
  },
  {
    fill: "#A67FFF",
    stroke: "transparent",
    color: "#fff",
    theme: "dark",
  },
  {
    fill: "#F0569B",
    stroke: "transparent",
    color: "#fff",
    theme: "dark",
  },
  {
    fill: "#808080",
    stroke: "transparent",
    color: "#fff",
    theme: "dark",
  },
];

const transparentFillColors: ColorOption[] = [
  {
    fill: "transparent",
    stroke: "#FF6A63",
    color: "currentColor",
  },
  {
    fill: "transparent",
    stroke: "#FB6C0C",
    color: "currentColor",
  },
  {
    fill: "transparent",
    stroke: "#FFA02C",
    color: "currentColor",
  },
  {
    fill: "transparent",
    stroke: "#24B079",
    color: "currentColor",
  },
  {
    fill: "transparent",
    stroke: "#3F71FB",
    color: "currentColor",
  },
  {
    fill: "transparent",
    stroke: "#A67FFF",
    color: "currentColor",
  },
  {
    fill: "transparent",
    stroke: "#F0569B",
    color: "currentColor",
  },
  {
    fill: "transparent",
    stroke: "#808080",
    color: "currentColor",
  },
];

/** 三组色板与填充方式一一对应，下标即色相位（切模式按同下标换组） */
const MODE_COLORS: Record<StyleMode, ColorOption[]> = {
  soft: fillWithStrokeColors,
  solid: fillWithoutStrokeColors,
  outline: transparentFillColors,
};

const NAMES = ["红", "橙", "黄", "绿", "蓝", "紫", "粉", "灰"];
const MODE_SWATCH_PREFIX: Record<StyleMode, string> = {
  soft: "浅",
  solid: "实心",
  outline: "描边",
};
/** 色相与基色都不可知时的兜底档位（蓝色） */
const DEFAULT_HUE_INDEX = 4;

const keyOf = (c: Pick<ColorOption, "fill" | "stroke">) => `${c.fill}|${c.stroke}`;
const toSwatches = (colors: ColorOption[], group: string): SwatchOption[] =>
  colors.map((c, i) => ({
    key: keyOf(c),
    label: `${group}${NAMES[i] ?? ""}`,
    fill: c.fill === "transparent" ? "var(--tau-bg-surface)" : c.fill,
    stroke: c.stroke === "transparent" ? c.fill : c.stroke,
  }));
const ALL = [...fillWithStrokeColors, ...fillWithoutStrokeColors, ...transparentFillColors];

/** 模式推导：fill 透明 → 线框；fill 实色且 stroke 透明 → 实心；其余 → 浅底 */
export function inferMode(el: Pick<GeometryElement, "fill" | "stroke">): StyleMode {
  const fill = el.fill ?? "";
  if (!fill || fill === "transparent" || fill === "none") return "outline";
  if ((el.stroke ?? "") === "transparent") return "solid";
  return "soft";
}

/** hex 与白色按 whiteRatio（白色占比）混合，输出 #rrggbb；非法输入原样返回 */
export function mixWithWhite(hex: string, whiteRatio: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const mixed = [16, 8, 0].map(shift => {
    const channel = (n >> shift) & 0xff;
    return Math.round(channel + (255 - channel) * whiteRatio)
      .toString(16)
      .padStart(2, "0");
  });
  return `#${mixed.join("")}`;
}

/** 自定义基色按目标模式生成完整色配置 */
export function customColorOption(mode: StyleMode, hex: string): ColorOption {
  if (mode === "outline") return { fill: "transparent", stroke: hex, color: "currentColor" };
  if (mode === "solid") return { fill: hex, stroke: "transparent", color: "#fff", theme: "dark" };
  return { fill: mixWithWhite(hex, 0.8), stroke: hex, color: "#000", theme: "light" };
}

/** 自定义基色：outline / soft 取描边色，solid 取填充色；非具体色值（currentColor 等）不可用 */
function baseColorOf(el: GeometryElement, mode: StyleMode): string | null {
  const hex = mode === "solid" ? el.fill : el.stroke;
  if (hex && hex !== "transparent" && hex !== "none" && hex !== "currentColor") return hex;
  return null;
}

const strokeWidthOptions: OptionItem<string>[] = [
  { value: "1", label: "细", glyph: <LineWeightGlyph width={1} /> },
  { value: "2", label: "标准", glyph: <LineWeightGlyph width={2} /> },
  { value: "4", label: "粗", glyph: <LineWeightGlyph width={4} /> },
  { value: "8", label: "特粗", glyph: <LineWeightGlyph width={8} /> },
];

const cornerRadiusOptions: OptionItem<string>[] = [
  { value: "0", label: "直角", glyph: <CornerGlyph radius={0} />, showLabel: true },
  { value: "8", label: "小", glyph: <CornerGlyph radius={8} />, showLabel: true },
  { value: "20", label: "大", glyph: <CornerGlyph radius={20} />, showLabel: true },
];

/** 样式：颜色（填充方式 + 色板）、边框粗细、圆角（矩形）合一弹层，数据写入与本地记忆沿用原三个设置器 */
const StyleSetterComponent: React.FC<GeometrySetterComponentProps> = ({ element, onChange }) => {
  const apply = useMemoizedFn((color: ColorOption) => {
    const newElement = produce(element, draft => {
      draft.stroke = color.stroke;
      draft.strokeOpacity = 1;
      draft.fill = color.fill;
      draft.fillOpacity = 1;
      draft.color = color.color;
      draft.theme = color.theme;
    });
    GeometryUtil.setLocalStorage("fill", color.fill);
    GeometryUtil.setLocalStorage("fillOpacity", "1");
    GeometryUtil.setLocalStorage("stroke", color.stroke);
    GeometryUtil.setLocalStorage("strokeOpacity", "1");
    GeometryUtil.setLocalStorage("color", color.color);
    GeometryUtil.setLocalStorage("theme", color.theme);
    onChange(newElement);
  });

  const mode = inferMode(element);
  const swatchKey = keyOf({
    fill: element.fill ?? "none",
    stroke: element.stroke ?? "currentColor",
  });
  const hueIndex = MODE_COLORS[mode].findIndex(c => keyOf(c) === swatchKey);
  const baseColor = baseColorOf(element, mode);

  // 切填充方式：色相跟随（同下标换组）；自定义色按目标模式重生成；基色不可知用蓝色兜底
  const switchMode = useMemoizedFn((next: StyleMode) => {
    if (hueIndex >= 0) {
      apply(MODE_COLORS[next][hueIndex]);
    } else if (baseColor) {
      apply(customColorOption(next, baseColor));
    } else {
      apply(MODE_COLORS[next][DEFAULT_HUE_INDEX]);
    }
  });

  const pick = (key: string) => {
    const c = ALL.find(o => keyOf(o) === key);
    if (c) apply(c);
  };

  // 触发按钮圆点：实色显 fill、线框显描边色、其余落墨色环
  const fill = element.fill ?? "none";
  const stroke = element.stroke ?? "currentColor";
  const solidFill = fill !== "none" && fill !== "transparent";
  const swatch: SwatchLook = {
    fill: solidFill ? fill : "var(--tau-bg-surface)",
    stroke:
      stroke !== "transparent" && stroke !== "currentColor"
        ? stroke
        : solidFill
          ? fill
          : "var(--tau-ink-1)",
  };

  const strokeWidth = element.strokeWidth || 1;
  const handleStrokeWidth = useMemoizedFn((value: number) => {
    const newElement = produce(element, draft => {
      draft.strokeWidth = value;
    });
    GeometryUtil.setLocalStorage("strokeWidth", String(value));
    onChange(newElement);
  });

  const isRectangle = element.geometryType === "rectangle";
  const cornerRadius = element.extraInfo?.cornerRadius || 0;
  const handleCornerRadius = useMemoizedFn((value: number) => {
    const newElement = produce(element, draft => {
      if (!draft.extraInfo) draft.extraInfo = {};
      draft.extraInfo.cornerRadius = value;
    });
    GeometryUtil.setLocalStorage("cornerRadius", String(value));
    onChange(newElement);
  });

  const gridValue = (options: OptionItem<string>[], value: number): string | null =>
    options.some(o => o.value === String(value)) ? String(value) : null;

  return (
    <AttrPopover label="样式" swatch={swatch} width={288}>
      <Field label="颜色">
        <Seg<StyleMode>
          label="填充方式"
          value={mode}
          onChange={switchMode}
          options={[
            { value: "soft", label: "浅底" },
            { value: "solid", label: "实心" },
            { value: "outline", label: "线框" },
          ]}
        />
        <div className="mt-2.5">
          <SwatchRow
            options={toSwatches(MODE_COLORS[mode], MODE_SWATCH_PREFIX[mode])}
            value={hueIndex >= 0 ? swatchKey : null}
            onChange={pick}
            custom={{
              value: baseColor ?? undefined,
              onChange: hex => apply(customColorOption(mode, hex)),
            }}
          />
        </div>
      </Field>
      <Field
        label="粗细"
        value={
          <Stepper
            label="粗细"
            min={1}
            max={20}
            step={1}
            value={strokeWidth}
            onChange={handleStrokeWidth}
          />
        }
      >
        <OptionGrid
          options={strokeWidthOptions}
          value={gridValue(strokeWidthOptions, strokeWidth)}
          onChange={v => handleStrokeWidth(Number(v))}
        />
      </Field>
      {isRectangle && (
        <Field
          label="圆角"
          value={
            <Stepper
              label="圆角"
              min={0}
              max={50}
              step={2}
              value={cornerRadius}
              onChange={handleCornerRadius}
            />
          }
        >
          <OptionGrid
            options={cornerRadiusOptions}
            value={gridValue(cornerRadiusOptions, cornerRadius)}
            onChange={v => handleCornerRadius(Number(v))}
          />
        </Field>
      )}
    </AttrPopover>
  );
};

// 样式设置器实现：合并原颜色 / 边框粗细 / 矩形圆角三个设置器
export class StyleSetter extends BaseGeometrySetter {
  constructor() {
    super("style-setter", "样式设置器", ["*"], 100);
  }

  getIcon(): React.ReactNode {
    return <Palette size={16} />;
  }

  getComponent(): React.ComponentType<GeometrySetterComponentProps> {
    return StyleSetterComponent;
  }
}
