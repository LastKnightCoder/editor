import React from "react";
import { Palette } from "lucide-react";
import { produce } from "immer";
import { useMemoizedFn } from "ahooks";

import { GeometrySetterComponentProps } from "../IGeometrySetter";
import { BaseGeometrySetter } from "../BaseGeometrySetter";
import { GeometryUtil } from "@/components/WhiteBoard/utils";
import { AttrPopover, Field, SwatchRow, type SwatchOption } from "@/components/WhiteBoard/chrome";

export interface ColorOption {
  fill: string;
  stroke: string;
  color: string;
  theme?: "light" | "dark";
}

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
    stroke: "#FF6A63",
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
    fill: "#FF6A63",
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
    stroke: "#FF6A63",
    color: "currentColor",
  },
  {
    fill: "transparent",
    stroke: "#808080",
    color: "currentColor",
  },
];

const NAMES = ["红", "橙", "黄", "绿", "蓝", "紫", "粉", "灰"];
const keyOf = (c: Pick<ColorOption, "fill" | "stroke">) => `${c.fill}|${c.stroke}`;
const toSwatches = (colors: ColorOption[], group: string): SwatchOption[] =>
  colors.map((c, i) => ({
    key: keyOf(c),
    label: `${group}${NAMES[i] ?? ""}`,
    fill: c.fill === "transparent" ? "var(--tau-bg-surface)" : c.fill,
    stroke: c.stroke === "transparent" ? c.fill : c.stroke,
  }));
const ALL = [...fillWithStrokeColors, ...fillWithoutStrokeColors, ...transparentFillColors];

/** 颜色：数据色，完整保留现状三组色板（浅底 + 描边 / 实心 / 仅描边）+ 自定义 */
const ColorSetterComponent: React.FC<GeometrySetterComponentProps> = ({ element, onChange }) => {
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
  const pick = (key: string) => {
    const c = ALL.find(o => keyOf(o) === key);
    if (c) apply(c);
  };
  const fill = element.fill ?? "none";
  const stroke = element.stroke ?? "currentColor";
  const value = keyOf({ fill, stroke });
  const solid = fill !== "none" && fill !== "transparent";
  const swatch = {
    fill: solid ? fill : "var(--tau-bg-surface)",
    stroke:
      stroke !== "transparent" && stroke !== "currentColor"
        ? stroke
        : solid
          ? fill
          : "var(--tau-ink-1)",
  };

  return (
    <AttrPopover label="颜色" swatch={swatch}>
      <Field label="浅底 + 描边">
        <SwatchRow options={toSwatches(fillWithStrokeColors, "浅")} value={value} onChange={pick} />
      </Field>
      <Field label="实心">
        <SwatchRow
          options={toSwatches(fillWithoutStrokeColors, "实心")}
          value={value}
          onChange={pick}
        />
      </Field>
      <Field label="仅描边">
        <SwatchRow
          options={toSwatches(transparentFillColors, "描边")}
          value={value}
          onChange={pick}
          custom={{
            value: element.stroke,
            onChange: hex => apply({ fill: "transparent", stroke: hex, color: "currentColor" }),
          }}
        />
      </Field>
    </AttrPopover>
  );
};

// 颜色设置器实现
export class ColorSetter extends BaseGeometrySetter {
  constructor() {
    // 所有几何图形都可以设置颜色，所以使用通配符 "*"
    super("color-setter", "颜色设置器", ["*"], 100);
  }

  getIcon(): React.ReactNode {
    return <Palette size={16} />;
  }

  getComponent(): React.ComponentType<GeometrySetterComponentProps> {
    return ColorSetterComponent;
  }
}
