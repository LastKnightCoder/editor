import { memo, useState } from "react";
import { useMemoizedFn } from "ahooks";
import { Popover, Tooltip } from "antd";
import { MdOutlineColorLens } from "react-icons/md";
import { produce } from "immer";
import { FrameElement, FRAME_DEFAULT_STYLES } from "../../../types";
import { FrameUtil } from "../../../utils";
import styles from "./index.module.less";

interface FrameSetterProps {
  element: FrameElement;
  onChange: (element: FrameElement) => void;
}

const FrameSetter = memo((props: FrameSetterProps) => {
  const { element, onChange } = props;
  const [styleOpen, setStyleOpen] = useState(false);

  // 找到当前元素对应的样式索引
  const currentStyleIndex = FRAME_DEFAULT_STYLES.findIndex(
    (style) =>
      style.backgroundColor === element.backgroundColor &&
      style.borderColor === element.borderColor,
  );

  const handleStyleChange = useMemoizedFn((styleIndex: number) => {
    const selectedStyle = FRAME_DEFAULT_STYLES[styleIndex];
    const newElement = produce(element, (draft) => {
      draft.backgroundColor = selectedStyle.backgroundColor;
      draft.borderColor = selectedStyle.borderColor;
      draft.borderWidth = selectedStyle.borderWidth;
      draft.borderRadius = selectedStyle.borderRadius;
    });

    // 保存到本地存储
    FrameUtil.setLocalStorage("backgroundColor", selectedStyle.backgroundColor);
    FrameUtil.setLocalStorage("borderColor", selectedStyle.borderColor);
    FrameUtil.setLocalStorage(
      "borderWidth",
      selectedStyle.borderWidth.toString(),
    );
    FrameUtil.setLocalStorage(
      "borderRadius",
      selectedStyle.borderRadius.toString(),
    );

    onChange(newElement);
    setStyleOpen(false);
  });

  const stopPropagation = useMemoizedFn((e: React.UIEvent) => {
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
  });

  const styleContent = (
    <div
      className={styles.popoverContent}
      onClick={stopPropagation}
      onPointerDown={stopPropagation}
      onPointerUp={stopPropagation}
      onWheel={stopPropagation}
    >
      <div className={styles.styleGrid}>
        {FRAME_DEFAULT_STYLES.map((style, index) => (
          <div
            key={index}
            className={styles.styleItem}
            onClick={() => handleStyleChange(index)}
            style={{
              backgroundColor: style.backgroundColor,
              border: `${currentStyleIndex === index ? 3 : 2}px solid ${style.borderColor}`,
              borderRadius: `${style.borderRadius}px`,
            }}
          />
        ))}
      </div>
    </div>
  );

  return (
    <div
      onPointerDown={stopPropagation}
      onDoubleClick={stopPropagation}
      onWheel={stopPropagation}
      className={styles.container}
    >
      {/* 样式选择 */}
      <Popover
        open={styleOpen}
        onOpenChange={setStyleOpen}
        styles={{
          body: {
            padding: 0,
            marginLeft: 16,
          },
        }}
        trigger={"click"}
        content={styleContent}
        placement={"right"}
        arrow={false}
      >
        <Tooltip title={"选择样式"} trigger={"hover"} placement={"left"}>
          <div className={styles.item}>
            <MdOutlineColorLens />
          </div>
        </Tooltip>
      </Popover>
    </div>
  );
});

export default FrameSetter;
