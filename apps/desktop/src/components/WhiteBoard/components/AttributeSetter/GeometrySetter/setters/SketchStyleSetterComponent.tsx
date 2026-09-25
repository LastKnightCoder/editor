import React, { useEffect, useMemo, useRef } from "react";
import { produce } from "immer";
import rough from "roughjs";
import { useMemoizedFn } from "ahooks";

import { GeometrySetterComponentProps } from "../IGeometrySetter";
import { GeometryElement } from "../../../../plugins";
import { GeometryUtil } from "@/components/WhiteBoard/utils";
import { AttrPopover, Field, OptionGrid, Slider } from "@/components/WhiteBoard/chrome";
import { ScribbleIcon } from "@/components/WhiteBoard/chrome/icons";

type SketchOptionKey = keyof NonNullable<GeometryElement["sketchOptions"]>;
type SketchOptionValue<K extends SketchOptionKey> = NonNullable<
  GeometryElement["sketchOptions"]
>[K];

const FILL_STYLE_OPTIONS = [
  { label: "默认填充", value: "hachure" },
  { label: "实心填充", value: "solid" },
  { label: "锯齿填充", value: "zigzag" },
  { label: "交叉填充", value: "cross-hatch" },
  { label: "点状填充", value: "dots" },
  { label: "虚线填充", value: "dashed" },
  { label: "锯齿线填充", value: "zigzag-line" },
] as const;

/** 用 rough.js 画出填充纹理示意（描边与填充色跟随主题 token） */
const FillStyleGlyph = ({ style }: { style: string }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const cssVar = (name: string, fallback: string) =>
      getComputedStyle(container).getPropertyValue(name).trim() || fallback;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    rough.canvas(canvas).rectangle(3, 3, canvas.width - 6, canvas.height - 6, {
      fillStyle: style as never,
      fill: cssVar("--tau-accent", "#3b82f6"),
      stroke: cssVar("--tau-ink-2", "#666666"),
      strokeWidth: 1,
      roughness: 1,
    });
  }, [style]);

  return (
    <span ref={containerRef} className="block">
      <canvas ref={canvasRef} width={44} height={24} />
    </span>
  );
};

// 草图风格设置器组件
const SketchStyleSetterComponent: React.FC<GeometrySetterComponentProps> = ({
  element,
  onChange,
}) => {
  const sketchEnabled = element.sketchEnabled || false;
  const sketchOptions = element.sketchOptions;

  // 生成固定的seed值
  useEffect(() => {
    if (sketchEnabled && !sketchOptions?.seed) {
      const newElement = produce(element, draft => {
        if (!draft.sketchOptions) draft.sketchOptions = {};
        draft.sketchOptions.seed = Math.floor(Math.random() * 2147483647);
      });
      onChange(newElement);
    }
  }, [sketchEnabled, sketchOptions?.seed, element, onChange]);

  const handleSketchEnabledChange = useMemoizedFn((checked: boolean) => {
    const newElement = produce(element, draft => {
      draft.sketchEnabled = checked;
      if (checked && !draft.sketchOptions) {
        draft.sketchOptions = {
          roughness: 1,
          fillStyle: "hachure",
        };
      }
    });
    GeometryUtil.setLocalStorage("sketchEnabled", String(checked));
    if (checked) {
      GeometryUtil.setLocalStorage(
        "sketchOptions",
        GeometryUtil.serializeSketchOptions(newElement.sketchOptions)
      );
    }
    onChange(newElement);
  });

  const updateSketchOption = useMemoizedFn(
    <K extends SketchOptionKey>(key: K, value: SketchOptionValue<K>) => {
      const newElement = produce(element, draft => {
        if (!draft.sketchOptions) draft.sketchOptions = {};
        draft.sketchOptions[key] = value;
      });
      GeometryUtil.setLocalStorage(
        "sketchOptions",
        GeometryUtil.serializeSketchOptions(newElement.sketchOptions)
      );
      onChange(newElement);
    }
  );

  const currentOptions = useMemo(() => {
    const options = sketchOptions || {};
    return {
      ...options,
      roughness: options.roughness ?? 1,
      fillStyle: options.fillStyle || "hachure",
      hachureAngle: options.hachureAngle ?? 0,
      hachureGap: options.hachureGap ?? 8,
      fillWeight: options.fillWeight ?? 1,
    };
  }, [sketchOptions]);

  const fill = currentOptions.fillStyle;

  return (
    <AttrPopover
      label="草图风格"
      icon={<ScribbleIcon />}
      toggle={{ checked: sketchEnabled, onChange: handleSketchEnabledChange }}
    >
      {sketchEnabled && (
        <>
          <Field label="填充样式">
            <OptionGrid
              cols={4}
              tall
              options={FILL_STYLE_OPTIONS.map(o => ({
                value: o.value,
                label: o.label.replace("填充", "") || o.label,
                glyph: <FillStyleGlyph style={o.value} />,
              }))}
              value={fill}
              onChange={v => updateSketchOption("fillStyle", v)}
            />
          </Field>
          <Field label="粗糙度">
            <Slider
              label="粗糙度"
              min={0.1}
              max={3}
              step={0.1}
              value={currentOptions.roughness}
              format={v => v.toFixed(1)}
              onChange={v => updateSketchOption("roughness", v)}
            />
          </Field>
          {(fill === "hachure" || fill === "cross-hatch") && (
            <>
              <Field label="填充角度">
                <Slider
                  label="填充角度"
                  min={-90}
                  max={90}
                  unit="°"
                  value={currentOptions.hachureAngle}
                  onChange={v => updateSketchOption("hachureAngle", v)}
                />
              </Field>
              <Field label="填充间距">
                <Slider
                  label="填充间距"
                  min={1}
                  max={20}
                  value={currentOptions.hachureGap}
                  onChange={v => updateSketchOption("hachureGap", v)}
                />
              </Field>
            </>
          )}
          <Field label="填充粗细">
            <Slider
              label="填充粗细"
              min={0.1}
              max={3}
              step={0.1}
              value={currentOptions.fillWeight}
              format={v => v.toFixed(1)}
              onChange={v => updateSketchOption("fillWeight", v)}
            />
          </Field>
        </>
      )}
    </AttrPopover>
  );
};

export default SketchStyleSetterComponent;
