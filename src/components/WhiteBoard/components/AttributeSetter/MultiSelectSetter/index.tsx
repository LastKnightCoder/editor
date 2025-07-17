import { memo } from "react";
import { useMemoizedFn } from "ahooks";
import { Tooltip } from "antd";
import { produce } from "immer";
import {
  MdAlignHorizontalLeft,
  MdAlignHorizontalRight,
  MdAlignVerticalTop,
  MdAlignVerticalBottom,
  MdSpaceBar,
  MdHeight,
} from "react-icons/md";
import { BoardElement } from "@/components/WhiteBoard";
import { useViewPort } from "@/components/WhiteBoard/hooks";

import styles from "./index.module.less";

interface MultiSelectSetterProps {
  elements: BoardElement[];
  onChange: (elements: BoardElement[]) => void;
}

const MultiSelectSetter = memo((props: MultiSelectSetterProps) => {
  const { elements, onChange } = props;

  const { zoom } = useViewPort();

  const stopPropagation = useMemoizedFn((e: React.UIEvent) => {
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
  });

  // 左对齐，按照最左边的元素，设置相同的 x
  const handleAlignLeft = useMemoizedFn(() => {
    if (elements.length <= 1) return;

    const noArrowElements = elements.filter((el) => el.type !== "arrow");

    const minX = Math.min(...noArrowElements.map((el) => el.x));
    const newElements = noArrowElements.map((el) =>
      el.x === minX
        ? el
        : produce(el, (draft) => {
            draft.x = minX;
          }),
    );

    onChange(newElements);
  });

  // 右对齐，按照最右边的元素，设置相同的 x
  const handleAlignRight = useMemoizedFn(() => {
    if (elements.length <= 1) return;

    const noArrowElements = elements.filter((el) => el.type !== "arrow");

    const maxRight = Math.max(...noArrowElements.map((el) => el.x + el.width));
    const newElements = noArrowElements.map((el) => {
      const right = el.x + el.width;
      return right === maxRight
        ? el
        : produce(el, (draft) => {
            draft.x = maxRight - draft.width;
          });
    });

    onChange(newElements);
  });

  // 顶部对齐，按照最上面的元素，设置相同的 y
  const handleAlignTop = useMemoizedFn(() => {
    if (elements.length <= 1) return;

    const noArrowElements = elements.filter((el) => el.type !== "arrow");

    const minY = Math.min(...noArrowElements.map((el) => el.y));
    const newElements = noArrowElements.map((el) =>
      el.y === minY
        ? el
        : produce(el, (draft) => {
            draft.y = minY;
          }),
    );

    onChange(newElements);
  });

  // 底部对齐，按照最下面的元素，设置相同的 y
  const handleAlignBottom = useMemoizedFn(() => {
    if (elements.length <= 1) return;

    const noArrowElements = elements.filter((el) => el.type !== "arrow");

    const maxBottom = Math.max(
      ...noArrowElements.map((el) => el.y + el.height),
    );
    const newElements = noArrowElements.map((el) => {
      const bottom = el.y + el.height;
      return bottom === maxBottom
        ? el
        : produce(el, (draft) => {
            draft.y = maxBottom - draft.height;
          });
    });

    onChange(newElements);
  });

  // 横向均分，按照 x 排序，均匀分布元素
  const handleDistributeHorizontal = useMemoizedFn(() => {
    if (elements.length < 2) return;

    const noArrowElements = elements.filter((el) => el.type !== "arrow");

    // 按照x坐标排序
    const sortedElements = [...noArrowElements].sort((a, b) => a.x - b.x);

    // 获取第一个元素的位置作为起点
    const firstElement = sortedElements[0];
    const leftBound = firstElement.x;

    // 创建新元素数组
    const newElements = [...sortedElements];

    const gap = 24 / zoom;

    // 从左到右依次排列所有元素
    let currentX = leftBound;

    // 重新设置每个元素的位置
    for (let i = 1; i < sortedElements.length; i++) {
      const prevElement = sortedElements[i - 1];
      const element = sortedElements[i];

      const newElement = produce(element, (draft) => {
        draft.x = currentX + prevElement.width + gap;
      });

      currentX = newElement.x;

      newElements[i] = newElement;
    }

    onChange(newElements);
  });

  // 纵向均分，按照 y 排序，均匀分布元素
  const handleDistributeVertical = useMemoizedFn(() => {
    if (elements.length < 2) return;

    const noArrowElements = elements.filter((el) => el.type !== "arrow");

    // 按照y坐标排序
    const sortedElements = [...noArrowElements].sort((a, b) => a.y - b.y);

    // 获取第一个元素的位置作为起点
    const firstElement = sortedElements[0];
    const topBound = firstElement.y;

    // 创建新元素数组
    const newElements = [...sortedElements];

    const gap = 24 / zoom;

    // 从上到下依次排列所有元素
    let currentY = topBound;

    // 重新设置每个元素的位置
    for (let i = 1; i < sortedElements.length; i++) {
      const prevElement = sortedElements[i - 1];
      const element = sortedElements[i];

      const newElement = produce(element, (draft) => {
        draft.y = currentY + prevElement.height + gap;
      });

      currentY = newElement.y;

      newElements[i] = newElement;
    }

    onChange(newElements);
  });

  return (
    <div
      onPointerDown={stopPropagation}
      onDoubleClick={stopPropagation}
      onWheel={stopPropagation}
      className={styles.container}
    >
      <Tooltip title="左对齐" trigger="hover" placement="left">
        <div className={styles.item} onClick={handleAlignLeft}>
          <MdAlignHorizontalLeft />
        </div>
      </Tooltip>

      <Tooltip title="右对齐" trigger="hover" placement="left">
        <div className={styles.item} onClick={handleAlignRight}>
          <MdAlignHorizontalRight />
        </div>
      </Tooltip>

      <Tooltip title="顶部对齐" trigger="hover" placement="left">
        <div className={styles.item} onClick={handleAlignTop}>
          <MdAlignVerticalTop />
        </div>
      </Tooltip>

      <Tooltip title="底部对齐" trigger="hover" placement="left">
        <div className={styles.item} onClick={handleAlignBottom}>
          <MdAlignVerticalBottom />
        </div>
      </Tooltip>

      <Tooltip title="横向均分" trigger="hover" placement="left">
        <div className={styles.item} onClick={handleDistributeHorizontal}>
          <MdSpaceBar />
        </div>
      </Tooltip>

      <Tooltip title="纵向均分" trigger="hover" placement="left">
        <div className={styles.item} onClick={handleDistributeVertical}>
          <MdHeight />
        </div>
      </Tooltip>
    </div>
  );
});

export default MultiSelectSetter;
