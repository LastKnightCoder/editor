import styles from "./index.module.less";
import { ArrowElement, EArrowLineType, EMarkerType } from "../../../types";
import { Popover, Tooltip } from "antd";
import { produce } from "immer";
import Arrow from "../../Arrow";
import { ColorResult, BlockPicker } from "react-color";
import { BiSolidColorFill } from "react-icons/bi";
import { BsBorderWidth } from "react-icons/bs";

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
        <Tooltip title={"类型"}>
          <div className={styles.item}>
            <svg width={16} height={16} viewBox={"0 0 16 16"}>
              <Arrow
                sourceMarker={EMarkerType.None}
                targetMarker={EMarkerType.Arrow}
                lineType={EArrowLineType.STRAIGHT}
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
        <Tooltip title={"粗细"}>
          <div className={styles.item}>
            <BsBorderWidth />
          </div>
        </Tooltip>
      </Popover>
    </div>
  );
};

export default ArrowSetter;
