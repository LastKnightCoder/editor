import { memo } from "react";
import { useMemoizedFn } from "ahooks";
import { Tooltip, message } from "antd";
import { Link2, Ungroup } from "lucide-react";
import {
  MdAlignHorizontalLeft,
  MdAlignHorizontalRight,
  MdAlignVerticalTop,
  MdAlignVerticalBottom,
  MdSpaceBar,
  MdHeight,
} from "react-icons/md";
import { v4 as getUuid } from "uuid";
import { BoardElement } from "@/components/WhiteBoard";
import { useViewPort, useBoard } from "@/components/WhiteBoard/hooks";
import {
  applyHandwriteGroupIdPatch,
  getSharedHandwriteGroupId,
  isHandwriteElement,
  isMergeableHandwriteSelection,
  isValid,
} from "@/components/WhiteBoard/utils";

import styles from "./index.module.less";
import useTheme from "@/hooks/useTheme";
import classnames from "classnames";

interface MultiSelectSetterProps {
  elements: BoardElement[];
  onChange: (elements: BoardElement[]) => void;
}

const MultiSelectSetter = memo((props: MultiSelectSetterProps) => {
  const { elements, onChange } = props;

  const { zoom } = useViewPort();
  const board = useBoard();
  const { isDark } = useTheme();
  const canMergeHandwrite = isMergeableHandwriteSelection(elements);
  const sharedHandwriteGroupId = getSharedHandwriteGroupId(elements);
  const canSplitHandwrite =
    elements.length > 1 &&
    elements.every(isHandwriteElement) &&
    !!sharedHandwriteGroupId;

  const stopPropagation = useMemoizedFn((e: React.UIEvent) => {
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
  });

  const handleMergeHandwrite = useMemoizedFn(() => {
    if (!canMergeHandwrite) {
      message.warning("仅支持对两个及以上手写元素进行合并");
      return;
    }
    const mergedElements = applyHandwriteGroupIdPatch(elements, getUuid());
    onChange(mergedElements);
    message.success(`已合并 ${mergedElements.length} 条手写`);
  });

  const handleSplitHandwriteGroup = useMemoizedFn(() => {
    if (!canSplitHandwrite) {
      message.warning("当前选择不满足拆分手写组条件");
      return;
    }
    const splitElements = applyHandwriteGroupIdPatch(elements, null);
    onChange(splitElements);
    message.success(`已拆分 ${splitElements.length} 条手写`);
  });

  // 左对齐，按照最左边的元素，设置相同的 x
  const handleAlignLeft = useMemoizedFn(() => {
    if (elements.length <= 1) return;

    const minX = Math.min(...elements.map((el) => el.x));
    const newElements = elements
      .map((el) => {
        const diffX = minX - el.x;
        const newElement = board.moveElement(el, diffX, 0);
        return newElement;
      })
      .filter(isValid);

    onChange(newElements);
  });

  // 右对齐，按照最右边的元素，设置相同的 x
  const handleAlignRight = useMemoizedFn(() => {
    if (elements.length <= 1) return;

    const maxRight = Math.max(...elements.map((el) => el.x + el.width));
    const newElements = elements
      .map((el) => {
        const diffX = maxRight - el.x - el.width;
        const newElement = board.moveElement(el, diffX, 0);
        return newElement;
      })
      .filter(isValid);

    onChange(newElements);
  });

  // 顶部对齐，按照最上面的元素，设置相同的 y
  const handleAlignTop = useMemoizedFn(() => {
    if (elements.length <= 1) return;

    const minY = Math.min(...elements.map((el) => el.y));
    const newElements = elements
      .map((el) => {
        const diffY = minY - el.y;
        const newElement = board.moveElement(el, 0, diffY);
        return newElement;
      })
      .filter(isValid);

    onChange(newElements);
  });

  // 底部对齐，按照最下面的元素，设置相同的 y
  const handleAlignBottom = useMemoizedFn(() => {
    if (elements.length <= 1) return;

    const maxBottom = Math.max(...elements.map((el) => el.y + el.height));
    const newElements = elements
      .map((el) => {
        const diffY = maxBottom - el.y - el.height;
        const newElement = board.moveElement(el, 0, diffY);
        return newElement;
      })
      .filter(isValid);

    onChange(newElements);
  });

  // 横向均分，按照 x 排序，均匀分布元素
  const handleDistributeHorizontal = useMemoizedFn(() => {
    if (elements.length < 2) return;

    // 按照x坐标排序
    const sortedElements = [...elements].sort((a, b) => a.x - b.x);

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

      const diffX = currentX + prevElement.width + gap - element.x;

      const newElement = board.moveElement(element, diffX, 0);
      if (!newElement) continue;

      currentX = newElement.x;

      newElements[i] = newElement;
    }

    onChange(newElements);
  });

  // 纵向均分，按照 y 排序，均匀分布元素
  const handleDistributeVertical = useMemoizedFn(() => {
    if (elements.length < 2) return;

    // 按照y坐标排序
    const sortedElements = [...elements].sort((a, b) => a.y - b.y);

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

      const diffY = currentY + prevElement.height + gap - element.y;

      const newElement = board.moveElement(element, 0, diffY);
      if (!newElement) continue;

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
      className={classnames(styles.container, {
        [styles.dark]: isDark,
      })}
    >
      <Tooltip title="合并手写" trigger="hover" placement="left">
        <div
          className={classnames(styles.item, {
            [styles.disabledItem]: !canMergeHandwrite,
          })}
          onClick={handleMergeHandwrite}
        >
          <Link2 size={16} />
        </div>
      </Tooltip>

      <Tooltip title="拆分手写组" trigger="hover" placement="left">
        <div
          className={classnames(styles.item, {
            [styles.disabledItem]: !canSplitHandwrite,
          })}
          onClick={handleSplitHandwriteGroup}
        >
          <Ungroup size={16} />
        </div>
      </Tooltip>

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
