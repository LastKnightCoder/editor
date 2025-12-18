import { Popover, Tooltip, Switch, Slider, ConfigProvider, theme } from "antd";
import { produce } from "immer";
import { BiSolidColorFill } from "react-icons/bi";
import { BsBorderWidth } from "react-icons/bs";
import { PiPencilLineDuotone } from "react-icons/pi";
import { TbWaveSine } from "react-icons/tb";
import { DashOutlined } from "@ant-design/icons";
import Arrow from "../../Arrow";
import { ArrowElement, EArrowLineType, EMarkerType } from "../../../types";
import ThemeColorPicker from "./ThemeColorPicker";
import { getArrowDisplayColor } from "../../../utils/color";
import { getDefaultThemeColorId } from "../../../constants/theme-colors";

import styles from "./index.module.less";
import useTheme from "@/hooks/useTheme";
import classnames from "classnames";

interface ArrowSetterProps {
  element: ArrowElement;
  onChange: (element: ArrowElement) => void;
}

const arrowTypes = [
  {
    label: "直线",
    type: EArrowLineType.STRAIGHT,
  },
  {
    label: "曲线",
    type: EArrowLineType.CURVE,
  },
  {
    label: "正交线",
    type: EArrowLineType.ORTHOGONAL,
  },
] as const;

const markerTypes = [
  {
    label: "无箭头",
    type: EMarkerType.None,
  },
  {
    label: "标准箭头",
    type: EMarkerType.Arrow,
  },
  {
    label: "开放式箭头",
    type: EMarkerType.OpenArrow,
  },
  {
    label: "闭合式箭头",
    type: EMarkerType.ClosedArrow,
  },
  {
    label: "菱形箭头",
    type: EMarkerType.Diamond,
  },
  {
    label: "圆形箭头",
    type: EMarkerType.Circle,
  },
] as const;

const lineWidthOptions = [
  {
    label: "1px",
    value: 1,
  },
  {
    label: "2px",
    value: 2,
  },
  {
    label: "3px",
    value: 3,
  },
  {
    label: "4px",
    value: 4,
  },
  {
    label: "5px",
    value: 5,
  },
  {
    label: "6px",
    value: 6,
  },
  {
    label: "7px",
    value: 7,
  },
  {
    label: "8px",
    value: 8,
  },
  {
    label: "9px",
    value: 9,
  },
  {
    label: "10px",
    value: 10,
  },
] as const;

const dashPatterns = [
  {
    label: "标准虚线",
    value: [5, 5],
  },
  {
    label: "点线",
    value: [2, 2],
  },
  {
    label: "长虚线",
    value: [10, 5],
  },
  {
    label: "点划线",
    value: [10, 3, 2, 3],
  },
  {
    label: "密集虚线",
    value: [3, 3],
  },
];

const ArrowSetter = (props: ArrowSetterProps) => {
  const { element, onChange } = props;
  const { isDark } = useTheme();

  // 获取当前显示的颜色（用于预览）
  const displayColor = getArrowDisplayColor(element, isDark);
  // 二级菜单中使用的固定颜色（不跟随箭头颜色）
  const menuItemColor = isDark ? "rgba(241, 245, 249, 0.85)" : "rgba(15, 23, 42, 0.85)";

  const onSelectArrowType = (type: EArrowLineType) => {
    const newElement = produce(element, (draft) => {
      draft.lineType = type;
    });
    onChange(newElement);
  };

  const onSelectSourceMarker = (marker: EMarkerType) => {
    const newElement = produce(element, (draft) => {
      draft.source.marker = marker;
    });
    onChange(newElement);
  };

  const onSelectTargetMarker = (marker: EMarkerType) => {
    const newElement = produce(element, (draft) => {
      draft.target.marker = marker;
    });
    onChange(newElement);
  };

  // 选择主题预设颜色
  const onSelectThemeColor = (colorId: string) => {
    const newElement = produce(element, (draft) => {
      draft.themeColorId = colorId;
    });
    onChange(newElement);
  };

  const onLineWidthChange = (lineWidth: number) => {
    const newElement = produce(element, (draft) => {
      draft.lineWidth = lineWidth;
    });
    onChange(newElement);
  };

  const onSketchEnabledChange = (checked: boolean) => {
    const newElement = produce(element, (draft) => {
      draft.sketchEnabled = checked;
    });
    onChange(newElement);
  };

  const onRoughnessChange = (value: number) => {
    const newElement = produce(element, (draft) => {
      draft.roughness = value;
    });
    onChange(newElement);
  };

  const onDashedChange = (checked: boolean) => {
    const newElement = produce(element, (draft) => {
      draft.dashed = checked;
    });
    onChange(newElement);
  };

  const onDashArrayChange = (value: number[]) => {
    const newElement = produce(element, (draft) => {
      draft.dashArray = value;
    });
    onChange(newElement);
  };

  const onAnimatedChange = (checked: boolean) => {
    const newElement = produce(element, (draft) => {
      draft.animated = checked;
    });
    onChange(newElement);
  };

  const onAnimationSpeedChange = (value: number) => {
    const newElement = produce(element, (draft) => {
      draft.animationSpeed = value;
    });
    onChange(newElement);
  };

  return (
    <div
      className={classnames(styles.container, {
        [styles.dark]: isDark,
      })}
      onPointerDown={(e) => {
        e.stopPropagation();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
      }}
    >
      <Popover
        arrow={false}
        trigger={"click"}
        placement={"right"}
        styles={{
          container: {
            background: 'transparent',
            boxShadow: 'none',
            padding: 0,
            marginLeft: 12
          },
        }}
        content={
          <div className={classnames(styles.typeSelect, { "dark": isDark })}>
            {arrowTypes.map((type) => (
              <div
                key={type.type}
                className={styles.item}
                onClick={() => {
                  onSelectArrowType(type.type);
                }}
              >
                <Tooltip title={type.label}>
                  <svg width={24} height={24} viewBox={`0 0 1024 1024`}>
                    <Arrow
                      sourceMarker={EMarkerType.None}
                      targetMarker={EMarkerType.None}
                      lineType={type.type}
                      lineColor={menuItemColor}
                      lineWidth={50}
                      points={[
                        { x: 50, y: 800 },
                        { x: 974, y: 224 },
                      ]}
                    />
                  </svg>
                </Tooltip>
              </div>
            ))}
          </div>
        }
      >
        <Tooltip title={"线型"} placement={"left"}>
          <div className={styles.item}>
            <svg width={16} height={16} viewBox={"0 0 16 16"}>
              <Arrow
                sourceMarker={EMarkerType.None}
                targetMarker={EMarkerType.Arrow}
                lineType={element.lineType}
                lineColor={menuItemColor}
                lineWidth={1}
                points={[
                  { x: 1, y: 15 },
                  { x: 15, y: 1 },
                ]}
              />
            </svg>
          </div>
        </Tooltip>
      </Popover>

      <Popover
        arrow={false}
        trigger={"click"}
        placement={"right"}
        styles={{
          container: {
            background: 'transparent',
            boxShadow: 'none',
            padding: 0,
            marginLeft: 12
          },
        }}
        content={
          <div className={classnames(styles.typeSelect, { "dark": isDark })}>
            {markerTypes.map((marker) => (
              <div
                key={marker.type}
                className={styles.item}
                onClick={() => {
                  onSelectSourceMarker(marker.type);
                }}
              >
                <Tooltip title={marker.label}>
                  <svg width={24} height={24} viewBox={`0 0 1024 1024`}>
                    <Arrow
                      sourceMarker={marker.type}
                      targetMarker={EMarkerType.None}
                      lineType={EArrowLineType.STRAIGHT}
                      lineColor={menuItemColor}
                      lineWidth={50}
                      points={[
                        { x: 50, y: 512 },
                        { x: 974, y: 512 },
                      ]}
                    />
                  </svg>
                </Tooltip>
              </div>
            ))}
          </div>
        }
      >
        <Tooltip title={"起点箭头"} placement={"left"}>
          <div className={styles.item}>
            <svg width={16} height={16} viewBox={"0 0 16 16"}>
              <Arrow
                sourceMarker={element.source.marker}
                targetMarker={EMarkerType.None}
                lineType={EArrowLineType.STRAIGHT}
                lineColor={menuItemColor}
                lineWidth={1}
                points={[
                  { x: 1, y: 8 },
                  { x: 15, y: 8 },
                ]}
              />
            </svg>
          </div>
        </Tooltip>
      </Popover>

      <Popover
        arrow={false}
        trigger={"click"}
        placement={"right"}
        styles={{
          container: {
            background: 'transparent',
            boxShadow: 'none',
            padding: 0,
            marginLeft: 12
          },
        }}
        content={
          <div className={classnames(styles.typeSelect, { "dark": isDark })}>
            {markerTypes.map((marker) => (
              <div
                key={marker.type}
                className={styles.item}
                onClick={() => {
                  onSelectTargetMarker(marker.type);
                }}
              >
                <Tooltip title={marker.label}>
                  <svg width={24} height={24} viewBox={`0 0 1024 1024`}>
                    <Arrow
                      sourceMarker={EMarkerType.None}
                      targetMarker={marker.type}
                      lineType={EArrowLineType.STRAIGHT}
                      lineColor={menuItemColor}
                      lineWidth={50}
                      points={[
                        { x: 50, y: 512 },
                        { x: 974, y: 512 },
                      ]}
                    />
                  </svg>
                </Tooltip>
              </div>
            ))}
          </div>
        }
      >
        <Tooltip title={"终点箭头"} placement={"left"}>
          <div className={styles.item}>
            <svg width={16} height={16} viewBox={"0 0 16 16"}>
              <Arrow
                sourceMarker={EMarkerType.None}
                targetMarker={element.target.marker}
                lineType={EArrowLineType.STRAIGHT}
                lineColor={menuItemColor}
                lineWidth={1}
                points={[
                  { x: 1, y: 8 },
                  { x: 15, y: 8 },
                ]}
              />
            </svg>
          </div>
        </Tooltip>
      </Popover>

      <Popover
        arrow={false}
        trigger={"click"}
        placement={"right"}
        styles={{
          container: {
            padding: 0,
            marginLeft: 12,
            background: "transparent",
            boxShadow: 'none'
          },
        }}
        content={
          <ThemeColorPicker
            selectedColorId={element.themeColorId || getDefaultThemeColorId()}
            onSelect={onSelectThemeColor}
          />
        }
      >
        <Tooltip title={"颜色"} placement={"left"}>
          <div className={styles.item}>
            <BiSolidColorFill
              width={20}
              height={20}
              color={displayColor}
            />
          </div>
        </Tooltip>
      </Popover>

      <Popover
        arrow={false}
        trigger={"click"}
        placement={"right"}
        styles={{
          container: {
            background: 'transparent',
            boxShadow: 'none',
            padding: 0,
            marginLeft: 12
          },
        }}
        content={
          <div className={classnames(styles.widthSelect, { "dark": isDark })}>
            {lineWidthOptions.map((option) => (
              <div
                key={option.value}
                className={styles.item}
                onClick={() => {
                  onLineWidthChange(option.value);
                }}
              >
                  <svg width={24} height={24} viewBox={`0 0 24 24`}>
                    <Arrow
                      sourceMarker={EMarkerType.None}
                      targetMarker={EMarkerType.None}
                      lineType={EArrowLineType.STRAIGHT}
                      lineColor={menuItemColor}
                      lineWidth={option.value}
                      points={[
                        { x: 2, y: 22 },
                        { x: 22, y: 2 },
                      ]}
                    />
                  </svg>
              </div>
            ))}
          </div>
        }
      >
        <Tooltip title={"粗细"} placement={"left"}>
          <div className={styles.item}>
            <BsBorderWidth />
          </div>
        </Tooltip>
      </Popover>

      {/* 虚线设置器 */}
      <Popover
        arrow={false}
        trigger={"click"}
        placement={"right"}
        styles={{
          container: {
            background: 'transparent',
            boxShadow: 'none',
            padding: 0,
            marginLeft: 12
          },
        }}
        content={
          <div className={classnames(styles.popoverContainer, { "dark": isDark })}>
            <div className={styles.popoverRow}>
              <span className={styles.popoverLabel}>虚线</span>
              <Switch
                checked={element.dashed || false}
                onChange={onDashedChange}
                size="small"
              />
            </div>
            {element.dashed && (
              <div className={styles.popoverSection}>
                <div className={styles.popoverSectionTitle}>虚线样式</div>
                <div className={styles.dashPatternSelect}>
                  {dashPatterns.map((pattern) => (
                    <div
                      key={pattern.label}
                      className={`${styles.dashPatternItem} ${
                        JSON.stringify(element.dashArray) ===
                        JSON.stringify(pattern.value)
                          ? styles.active
                          : ""
                      }`}
                      onClick={() => onDashArrayChange(pattern.value)}
                    >
                      <svg width={60} height={20} style={{ marginBottom: 4 }}>
                        <line
                          x1={5}
                          y1={10}
                          x2={55}
                          y2={10}
                          stroke={
                            JSON.stringify(element.dashArray) ===
                            JSON.stringify(pattern.value)
                              ? isDark ? "#60a5fa" : "#3b82f6"
                              : isDark
                                ? "rgba(226, 232, 240, 0.65)"
                                : "rgba(15, 23, 42, 0.65)"
                          }
                          strokeWidth={2}
                          strokeDasharray={pattern.value.join(",")}
                        />
                      </svg>
                      <span>{pattern.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        }
      >
        <Tooltip title={"虚线"} placement={"left"}>
          <div className={styles.item}>
            <DashOutlined />
          </div>
        </Tooltip>
      </Popover>

      <Popover
        arrow={false}
        trigger={"click"}
        placement={"right"}
        styles={{
          container: {
            background: 'transparent',
            boxShadow: 'none',
            padding: 0,
            marginLeft: 12
          },
        }}
        content={
          <div className={classnames(styles.popoverContainer, { "dark": isDark })}>
            <div className={styles.popoverRow}>
              <span className={styles.popoverLabel}>草图风格</span>
              <Switch
                checked={element.sketchEnabled || false}
                onChange={onSketchEnabledChange}
                size="small"
              />
            </div>
            {element.sketchEnabled && (
              <div className={styles.popoverSection}>
                <div className={styles.popoverSectionTitle}>粗糙度</div>
                <ConfigProvider
                  theme={{
                    algorithm: theme.defaultAlgorithm,
                  }}
                >
                  <Slider
                    min={0.1}
                    max={3}
                    step={0.1}
                    value={element.roughness || 1}
                    onChange={onRoughnessChange}
                    tooltip={{ formatter: (value) => `${value}` }}
                  />
                </ConfigProvider>
              </div>
            )}
          </div>
        }
      >
        <Tooltip title={"草图风格"} placement={"left"}>
          <div className={styles.item}>
            <PiPencilLineDuotone />
          </div>
        </Tooltip>
      </Popover>

      <Popover
        arrow={false}
        trigger={"click"}
        placement={"right"}
        styles={{
          container: {
            background: 'transparent',
            boxShadow: 'none',
            padding: 0,
            marginLeft: 12
          },
        }}
        content={
          <div className={classnames(styles.popoverContainer, { "dark": isDark })}>
            <div className={styles.popoverRow}>
              <span className={styles.popoverLabel}>流动动画</span>
              <Switch
                checked={element.animated || false}
                onChange={onAnimatedChange}
                size="small"
              />
            </div>
            {element.animated && (
              <div className={styles.popoverSection}>
                <div className={styles.popoverSectionTitle}>动画速度</div>
                <Slider
                  min={1}
                  max={10}
                  step={1}
                  value={element.animationSpeed || 3}
                  onChange={onAnimationSpeedChange}
                  tooltip={{ formatter: (value) => `${value}` }}
                  marks={{
                    1: "慢",
                    5: "中",
                    10: "快",
                  }}
                />
                <div className={styles.popoverSubLabel}>
                  {element.dashed ? "虚线将显示流动效果" : "实线将显示流动点"}
                </div>
              </div>
            )}
          </div>
        }
      >
        <Tooltip title={"流动动画"} placement={"left"}>
          <div className={styles.item}>
            <TbWaveSine />
          </div>
        </Tooltip>
      </Popover>
    </div>
  );
};

export default ArrowSetter;
