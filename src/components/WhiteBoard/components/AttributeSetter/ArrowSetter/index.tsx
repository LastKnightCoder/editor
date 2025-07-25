import styles from "./index.module.less";
import { ArrowElement, EArrowLineType, EMarkerType } from "../../../types";
import { Popover, Tooltip, Switch, Slider, ConfigProvider, theme } from "antd";
import { produce } from "immer";
import Arrow from "../../Arrow";
import { ColorResult, BlockPicker } from "react-color";
import { BiSolidColorFill } from "react-icons/bi";
import { BsBorderWidth } from "react-icons/bs";
import { PiPencilLineDuotone } from "react-icons/pi";

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

const ArrowSetter = (props: ArrowSetterProps) => {
  const { element, onChange } = props;

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

  const onSelectColor = (color: ColorResult) => {
    const newElement = produce(element, (draft) => {
      draft.lineColor = color.hex;
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

  return (
    <div
      className={styles.container}
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
          body: {
            marginLeft: 24,
            background: "white",
          },
        }}
        content={
          <div className={styles.typeSelect}>
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
                      lineColor={"black"}
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
                lineColor={"black"}
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
          body: {
            marginLeft: 24,
            background: "white",
          },
        }}
        content={
          <div className={styles.typeSelect}>
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
                      lineColor={"black"}
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
                lineColor={"black"}
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
          body: {
            marginLeft: 24,
            background: "white",
          },
        }}
        content={
          <div className={styles.typeSelect}>
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
                      lineColor={"black"}
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
                lineColor={"black"}
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
          body: {
            marginLeft: 24,
            padding: 0,
            background: "transparent",
          },
        }}
        content={
          <BlockPicker
            triangle={"hide"}
            color={element.lineColor}
            onChange={onSelectColor}
          />
        }
      >
        <Tooltip title={"颜色"} placement={"left"}>
          <div className={styles.item}>
            <BiSolidColorFill
              width={20}
              height={20}
              color={element.lineColor}
            />
          </div>
        </Tooltip>
      </Popover>

      <Popover
        arrow={false}
        trigger={"click"}
        placement={"right"}
        styles={{
          body: {
            marginLeft: 24,
            background: "white",
          },
        }}
        content={
          <div className={styles.widthSelect}>
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
                    lineColor={"black"}
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

      {/* 草图风格设置器 */}
      <Popover
        arrow={false}
        trigger={"click"}
        placement={"right"}
        styles={{
          body: {
            padding: 12,
            marginLeft: 24,
            width: 200,
            background: "white",
          },
        }}
        content={
          <div className="text-black">
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
                checked={element.sketchEnabled || false}
                onChange={onSketchEnabledChange}
                size="small"
              />
            </div>
            {element.sketchEnabled && (
              <div>
                <span>粗糙度</span>
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
    </div>
  );
};

export default ArrowSetter;
