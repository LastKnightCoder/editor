import React, { useEffect } from "react";
import { GeometrySetterComponentProps } from "../IGeometrySetter";
import { Popover, Tooltip, Switch, Slider, Select } from "antd";
import { produce } from "immer";
import { useMemoizedFn } from "ahooks";
import styles from "./setters.module.less";
import { PiPencilLineDuotone } from "react-icons/pi";
import { GeometryElement } from "../../../../plugins/GeometryPlugin";

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
];

// 草图风格设置器组件
const SketchStyleSetterComponent: React.FC<GeometrySetterComponentProps> = ({
  element,
  onChange,
}) => {
  const sketchEnabled = element.sketchEnabled || false;
  const sketchOptions = element.sketchOptions || {};

  // 生成固定的seed值
  useEffect(() => {
    if (sketchEnabled && !sketchOptions.seed) {
      const newElement = produce(element, (draft) => {
        if (!draft.sketchOptions) draft.sketchOptions = {};
        draft.sketchOptions.seed = Math.floor(Math.random() * 2147483647);
      });
      onChange(newElement);
    }
  }, [sketchEnabled, sketchOptions.seed, element, onChange]);

  const handleSketchEnabledChange = useMemoizedFn((checked: boolean) => {
    const newElement = produce(element, (draft) => {
      draft.sketchEnabled = checked;
      if (checked && !draft.sketchOptions) {
        draft.sketchOptions = {
          roughness: 1,
          fillStyle: "hachure",
        };
      }
    });
    onChange(newElement);
  });

  const updateSketchOption = useMemoizedFn(
    <K extends SketchOptionKey>(key: K, value: SketchOptionValue<K>) => {
      const newElement = produce(element, (draft) => {
        if (!draft.sketchOptions) draft.sketchOptions = {};
        draft.sketchOptions[key] = value;
      });
      onChange(newElement);
    },
  );

  return (
    <Popover
      arrow={false}
      trigger="click"
      placement="right"
      styles={{
        body: {
          padding: 12,
          marginLeft: 12,
          width: 240,
        },
      }}
      content={
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 8,
            }}
          >
            <span>草图风格</span>
            <Switch
              checked={sketchEnabled}
              onChange={handleSketchEnabledChange}
              size="small"
            />
          </div>
          {sketchEnabled && (
            <div className={styles.sketchOptions}>
              <div className={styles.optionItem}>
                <span>粗糙度</span>
                <Slider
                  min={0.1}
                  max={3}
                  step={0.1}
                  value={sketchOptions.roughness ?? 1}
                  onChange={(value) => updateSketchOption("roughness", value)}
                  tooltip={{ formatter: (value) => `${value}` }}
                />
              </div>
              <div className={styles.optionItem}>
                <span>填充样式</span>
                <Select
                  size="small"
                  value={sketchOptions.fillStyle || "hachure"}
                  onChange={(value) => updateSketchOption("fillStyle", value)}
                  options={FILL_STYLE_OPTIONS}
                  style={{ width: "100%" }}
                />
              </div>
              {(sketchOptions.fillStyle === "hachure" ||
                sketchOptions.fillStyle === "cross-hatch") && (
                <>
                  <div className={styles.optionItem}>
                    <span>填充角度</span>
                    <Slider
                      min={-90}
                      max={90}
                      value={sketchOptions.hachureAngle ?? 0}
                      onChange={(value) =>
                        updateSketchOption("hachureAngle", value)
                      }
                      tooltip={{ formatter: (value) => `${value}°` }}
                    />
                  </div>
                  <div className={styles.optionItem}>
                    <span>填充间距</span>
                    <Slider
                      min={1}
                      max={20}
                      value={sketchOptions.hachureGap ?? 8}
                      onChange={(value) =>
                        updateSketchOption("hachureGap", value)
                      }
                    />
                  </div>
                </>
              )}
              <div className={styles.optionItem}>
                <span>填充粗细</span>
                <Slider
                  min={0.1}
                  max={3}
                  step={0.1}
                  value={sketchOptions.fillWeight ?? 1}
                  onChange={(value) => updateSketchOption("fillWeight", value)}
                />
              </div>
            </div>
          )}
        </div>
      }
    >
      <Tooltip title="草图风格" placement="left">
        <div className={styles.item}>
          <PiPencilLineDuotone />
        </div>
      </Tooltip>
    </Popover>
  );
};

export default SketchStyleSetterComponent;
