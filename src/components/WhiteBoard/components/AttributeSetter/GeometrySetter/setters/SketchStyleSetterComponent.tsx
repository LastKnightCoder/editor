import React, { useEffect, useMemo } from "react";
import { GeometrySetterComponentProps } from "../IGeometrySetter";
import { Popover, Tooltip, Switch } from "antd";
import { produce } from "immer";
import { useMemoizedFn } from "ahooks";
import styles from "./setters.module.less";
import { PiPencilLineDuotone } from "react-icons/pi";
import { GeometryElement } from "../../../../plugins/GeometryPlugin";
import { StyleOptionGrid } from "./components/StyleOptionGrid";
import { ModernSlider } from "./components/ModernSlider";
import useTheme from "@/hooks/useTheme";
import classnames from "classnames";

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

// 草图风格设置器组件
const SketchStyleSetterComponent: React.FC<GeometrySetterComponentProps> = ({
  element,
  onChange,
}) => {
  const { isDark } = useTheme();
  const sketchEnabled = element.sketchEnabled || false;
  const sketchOptions = element.sketchOptions;

  // 生成固定的seed值
  useEffect(() => {
    if (sketchEnabled && !sketchOptions?.seed) {
      const newElement = produce(element, (draft) => {
        if (!draft.sketchOptions) draft.sketchOptions = {};
        draft.sketchOptions.seed = Math.floor(Math.random() * 2147483647);
      });
      onChange(newElement);
    }
  }, [sketchEnabled, sketchOptions?.seed, element, onChange]);

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

  const renderControls = () => {
    if (!sketchEnabled) return null;

    return (
      <div className={styles.controls}>
        <div className={styles.controlGroup}>
          <div className={styles.controlLabel}>填充样式</div>
          <StyleOptionGrid
            options={FILL_STYLE_OPTIONS}
            selectedValue={currentOptions.fillStyle as string}
            onSelect={(value: string) =>
              updateSketchOption("fillStyle", value as any)
            }
          />
        </div>

        <div className={styles.controlGroup}>
          <div className={styles.controlLabel}>粗糙度</div>
          <ModernSlider
            min={0.1}
            max={3}
            step={0.1}
            value={currentOptions.roughness}
            onChange={(value: number) => updateSketchOption("roughness", value)}
          />
        </div>

        {(currentOptions.fillStyle === "hachure" ||
          currentOptions.fillStyle === "cross-hatch") && (
          <>
            <div className={styles.controlGroup}>
              <div className={styles.controlLabel}>填充角度</div>
              <ModernSlider
                min={-90}
                max={90}
                value={currentOptions.hachureAngle}
                onChange={(value: number) =>
                  updateSketchOption("hachureAngle", value)
                }
              />
            </div>
            <div className={styles.controlGroup}>
              <div className={styles.controlLabel}>填充间距</div>
              <ModernSlider
                min={1}
                max={20}
                value={currentOptions.hachureGap}
                onChange={(value: number) =>
                  updateSketchOption("hachureGap", value)
                }
              />
            </div>
          </>
        )}

        <div className={styles.controlGroup}>
          <div className={styles.controlLabel}>填充粗细</div>
          <ModernSlider
            min={0.1}
            max={3}
            step={0.1}
            value={currentOptions.fillWeight}
            onChange={(value: number) =>
              updateSketchOption("fillWeight", value)
            }
          />
        </div>
      </div>
    );
  };

  return (
    <Popover
      arrow={false}
      trigger="click"
      placement="right"
      styles={{
        body: {
          padding: 0,
          marginLeft: 24,
          width: 320,
        },
      }}
      content={
        <div
          className={classnames(styles.modernSketchOptions, {
            [styles.dark]: isDark,
          })}
        >
          <div className={styles.header}>
            <span className={styles.title}>草图风格</span>
            <Switch
              checked={sketchEnabled}
              onChange={handleSketchEnabledChange}
              size="small"
            />
          </div>

          {renderControls()}
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
