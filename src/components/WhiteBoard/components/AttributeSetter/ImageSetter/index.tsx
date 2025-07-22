import { memo, useState } from "react";
import { useMemoizedFn } from "ahooks";
import { Popover, Tooltip } from "antd";
import { MdOutlineColorLens, MdOutlineTextFields } from "react-icons/md";
import { CgAlignLeft, CgAlignCenter, CgAlignRight } from "react-icons/cg";
import { BiSolidUpArrow, BiSolidDownArrow } from "react-icons/bi";
import { produce } from "immer";
import { ImageElement } from "../../../types";
import {
  EDescriptionPosition,
  EDescriptionAlignment,
} from "../../../constants/image";

import styles from "./index.module.less";

interface ImageSetterProps {
  element: ImageElement;
  onChange: (element: ImageElement) => void;
}

interface DescriptionColor {
  backgroundColor: string;
  borderColor: string;
  color: string;
}

const DESCRIPTION_COLORS: DescriptionColor[] = [
  {
    backgroundColor: "transparent",
    borderColor: "transparent",
    color: "currentColor",
  },
  {
    backgroundColor: "rgba(59, 130, 246, 0.1)",
    borderColor: "#3b82f6",
    color: "currentColor",
  },
  {
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    borderColor: "#10b981",
    color: "currentColor",
  },
  {
    backgroundColor: "rgba(253, 224, 71, 0.15)",
    borderColor: "#fde047",
    color: "currentColor",
  },
  {
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    borderColor: "#f59e0b",
    color: "currentColor",
  },
  {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderColor: "#ef4444",
    color: "currentColor",
  },
  {
    backgroundColor: "rgba(139, 92, 246, 0.1)",
    borderColor: "#8b5cf6",
    color: "currentColor",
  },
  {
    backgroundColor: "rgba(107, 114, 128, 0.1)",
    borderColor: "#6b7280",
    color: "currentColor",
  },
];

const ImageSetter = memo((props: ImageSetterProps) => {
  const { element, onChange } = props;

  const { showDescription = false } = element;
  const [colorPickerVisible, setColorPickerVisible] = useState(false);
  const [positionPopoverVisible, setPositionPopoverVisible] = useState(false);
  const [alignmentPopoverVisible, setAlignmentPopoverVisible] = useState(false);

  const handlePositionChange = useMemoizedFn(
    (position: EDescriptionPosition) => {
      const newElement = produce(element, (draft) => {
        draft.descriptionPosition = position;
      });
      onChange(newElement);
      setPositionPopoverVisible(false);
    },
  );

  const handleAlignmentChange = useMemoizedFn(
    (alignment: EDescriptionAlignment) => {
      const newElement = produce(element, (draft) => {
        draft.descriptionAlignment = alignment;
      });
      onChange(newElement);
      setAlignmentPopoverVisible(false);
    },
  );

  const handleOnSelectColor = useMemoizedFn((color: DescriptionColor) => {
    const newElement = produce(element, (draft) => {
      if (!draft.descriptionStyle) {
        draft.descriptionStyle = {};
      }
      draft.descriptionStyle.backgroundColor = color.backgroundColor;
      draft.descriptionStyle.borderColor = color.borderColor;
      draft.descriptionStyle.color = color.color;
    });
    onChange(newElement);
    setColorPickerVisible(false);
  });

  const handleToggleDescriptionChange = useMemoizedFn(() => {
    const newElement = produce(element, (draft) => {
      draft.showDescription = !draft.showDescription;
    });
    onChange(newElement);
  });

  const stopPropagation = useMemoizedFn((e: React.UIEvent) => {
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
  });

  const positionContent = (
    <div
      className={styles.popoverContent}
      onClick={stopPropagation}
      onPointerDown={stopPropagation}
      onPointerUp={stopPropagation}
      onWheel={stopPropagation}
    >
      <div
        className={styles.positionItem}
        onClick={() => handlePositionChange(EDescriptionPosition.TOP)}
      >
        <BiSolidUpArrow />
        <span>上方</span>
      </div>
      <div
        className={styles.positionItem}
        onClick={() => handlePositionChange(EDescriptionPosition.BOTTOM)}
      >
        <BiSolidDownArrow />
        <span>下方</span>
      </div>
    </div>
  );

  const alignmentContent = (
    <div
      className={styles.popoverContent}
      onClick={stopPropagation}
      onPointerDown={stopPropagation}
      onPointerUp={stopPropagation}
      onWheel={stopPropagation}
    >
      <div
        className={styles.alignItem}
        onClick={() => handleAlignmentChange(EDescriptionAlignment.LEFT)}
      >
        <CgAlignLeft />
        <span>左对齐</span>
      </div>
      <div
        className={styles.alignItem}
        onClick={() => handleAlignmentChange(EDescriptionAlignment.CENTER)}
      >
        <CgAlignCenter />
        <span>居中</span>
      </div>
      <div
        className={styles.alignItem}
        onClick={() => handleAlignmentChange(EDescriptionAlignment.RIGHT)}
      >
        <CgAlignRight />
        <span>右对齐</span>
      </div>
    </div>
  );

  const colorContent = (
    <div
      onClick={stopPropagation}
      onPointerDown={stopPropagation}
      onPointerUp={stopPropagation}
      onWheel={stopPropagation}
      className="flex flex-wrap gap-2 p-4"
    >
      {DESCRIPTION_COLORS.map((color) => (
        <div
          key={`${color.backgroundColor}`}
          className={"w-4 h-4 rounded-sm cursor-pointer relative border-[2px]"}
          style={{
            background: color.backgroundColor,
            borderColor:
              color.borderColor !== "transparent" ? color.borderColor : "gray",
          }}
          onClick={() => handleOnSelectColor(color)}
        ></div>
      ))}
    </div>
  );

  return (
    <div
      onPointerDown={stopPropagation}
      onDoubleClick={stopPropagation}
      onWheel={stopPropagation}
      className={styles.container}
    >
      <Tooltip
        title={!showDescription ? "显示描述" : "隐藏描述"}
        trigger={"hover"}
        placement={"left"}
      >
        <div className={styles.item} onClick={handleToggleDescriptionChange}>
          <MdOutlineTextFields />
        </div>
      </Tooltip>
      {showDescription && (
        <>
          <Popover
            open={positionPopoverVisible}
            onOpenChange={setPositionPopoverVisible}
            styles={{
              body: {
                padding: 0,
                marginLeft: 24,
                backgroundColor: "white",
              },
            }}
            trigger={"click"}
            content={positionContent}
            placement={"right"}
            arrow={false}
          >
            <Tooltip title={"描述位置"} trigger={"hover"} placement={"left"}>
              <div className={styles.item}>
                {element.descriptionPosition === EDescriptionPosition.TOP ? (
                  <BiSolidUpArrow />
                ) : (
                  <BiSolidDownArrow />
                )}
              </div>
            </Tooltip>
          </Popover>

          <Popover
            open={alignmentPopoverVisible}
            onOpenChange={setAlignmentPopoverVisible}
            styles={{
              body: {
                padding: 0,
                marginLeft: 24,
                backgroundColor: "white",
              },
            }}
            trigger={"click"}
            content={alignmentContent}
            placement={"right"}
            arrow={false}
          >
            <Tooltip title={"文本对齐"} trigger={"hover"} placement={"left"}>
              <div className={styles.item}>
                {element.descriptionAlignment ===
                  EDescriptionAlignment.LEFT && <CgAlignLeft />}
                {element.descriptionAlignment ===
                  EDescriptionAlignment.CENTER && <CgAlignCenter />}
                {element.descriptionAlignment ===
                  EDescriptionAlignment.RIGHT && <CgAlignRight />}
              </div>
            </Tooltip>
          </Popover>

          <Popover
            open={colorPickerVisible}
            onOpenChange={setColorPickerVisible}
            styles={{
              body: {
                padding: 0,
                marginLeft: 24,
                backgroundColor: "white",
              },
            }}
            trigger={"click"}
            content={colorContent}
            placement={"right"}
            arrow={false}
          >
            <Tooltip title={"背景颜色"} trigger={"hover"} placement={"left"}>
              <div className={styles.item}>
                <MdOutlineColorLens />
              </div>
            </Tooltip>
          </Popover>
        </>
      )}
    </div>
  );
});

export default ImageSetter;
