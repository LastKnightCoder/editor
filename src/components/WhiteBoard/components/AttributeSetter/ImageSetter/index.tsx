import { memo, useState } from "react";
import { useMemoizedFn } from "ahooks";
import { Popover, Tooltip } from "antd";
import { BlockPicker } from "react-color";
import { MdOutlineColorLens } from "react-icons/md";
import { CgAlignLeft, CgAlignCenter, CgAlignRight } from "react-icons/cg";
import { BiSolidUpArrow, BiSolidDownArrow } from "react-icons/bi";
import { TbTextSize } from "react-icons/tb";
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

const ImageSetter = memo((props: ImageSetterProps) => {
  const { element, onChange } = props;
  const [colorPickerVisible, setColorPickerVisible] = useState(false);
  const [positionPopoverVisible, setPositionPopoverVisible] = useState(false);
  const [alignmentPopoverVisible, setAlignmentPopoverVisible] = useState(false);
  const [fontSizePopoverVisible, setFontSizePopoverVisible] = useState(false);

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

  const handleColorChange = useMemoizedFn((color: any) => {
    const newElement = produce(element, (draft) => {
      if (!draft.descriptionStyle) {
        draft.descriptionStyle = {};
      }
      draft.descriptionStyle.color = color.hex;
    });
    onChange(newElement);
    setColorPickerVisible(false);
  });

  const handleFontSizeChange = useMemoizedFn((fontSize: number) => {
    const newElement = produce(element, (draft) => {
      if (!draft.descriptionStyle) {
        draft.descriptionStyle = {};
      }
      draft.descriptionStyle.fontSize = fontSize;
    });
    onChange(newElement);
    setFontSizePopoverVisible(false);
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

  const fontSizeContent = (
    <div
      className={styles.popoverContent}
      onClick={stopPropagation}
      onPointerDown={stopPropagation}
      onPointerUp={stopPropagation}
      onWheel={stopPropagation}
    >
      {[12, 14, 16, 18, 20].map((size) => (
        <div
          key={size}
          className={styles.fontSizeItem}
          onClick={() => handleFontSizeChange(size)}
        >
          <span style={{ fontSize: `${size}px` }}>{size}</span>
        </div>
      ))}
    </div>
  );

  const colorContent = (
    <div
      onClick={stopPropagation}
      onPointerDown={stopPropagation}
      onPointerUp={stopPropagation}
      onWheel={stopPropagation}
    >
      <BlockPicker
        color={element.descriptionStyle?.color}
        onChange={handleColorChange}
        triangle="hide"
      />
    </div>
  );

  return (
    <div
      onPointerDown={stopPropagation}
      onDoubleClick={stopPropagation}
      onWheel={stopPropagation}
      className={styles.container}
    >
      <Popover
        open={positionPopoverVisible}
        onOpenChange={setPositionPopoverVisible}
        styles={{
          body: {
            padding: 0,
            marginLeft: 24,
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
          },
        }}
        trigger={"click"}
        content={alignmentContent}
        placement={"right"}
        arrow={false}
      >
        <Tooltip title={"文本对齐"} trigger={"hover"} placement={"left"}>
          <div className={styles.item}>
            {element.descriptionAlignment === EDescriptionAlignment.LEFT && (
              <CgAlignLeft />
            )}
            {element.descriptionAlignment === EDescriptionAlignment.CENTER && (
              <CgAlignCenter />
            )}
            {element.descriptionAlignment === EDescriptionAlignment.RIGHT && (
              <CgAlignRight />
            )}
          </div>
        </Tooltip>
      </Popover>

      <Popover
        open={fontSizePopoverVisible}
        onOpenChange={setFontSizePopoverVisible}
        styles={{
          body: {
            padding: 0,
            marginLeft: 24,
          },
        }}
        trigger={"click"}
        content={fontSizeContent}
        placement={"right"}
        arrow={false}
      >
        <Tooltip title={"字体大小"} trigger={"hover"} placement={"left"}>
          <div className={styles.item}>
            <TbTextSize />
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
          },
        }}
        trigger={"click"}
        content={colorContent}
        placement={"right"}
        arrow={false}
      >
        <Tooltip title={"文字颜色"} trigger={"hover"} placement={"left"}>
          <div className={styles.item}>
            <MdOutlineColorLens
              style={{ color: element.descriptionStyle?.color }}
            />
          </div>
        </Tooltip>
      </Popover>
    </div>
  );
});

export default ImageSetter;
