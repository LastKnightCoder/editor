import { useAttributeI18n } from "../../../attributes-i18n";
import { memo } from "react";
import { useMemoizedFn } from "ahooks";
import {
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  Link2,
  Ungroup,
} from "lucide-react";
import { toast } from "@tau/ui";
import { v4 as getUuid } from "uuid";
import { BoardElement } from "../../../index";
import { useBoard, useZoom } from "../../../hooks";
import {
  applyHandwriteGroupIdPatch,
  getSharedHandwriteGroupId,
  isHandwriteElement,
  isMergeableHandwriteSelection,
  isValid,
} from "../../../utils";
import { AttrAction, ChromeGap } from "../../../chrome";
import { MultiSketchPopover } from "../SketchPopover";

interface MultiSelectSetterProps {
  /** 可对齐元素（已剔除连线与容器内部元素） */
  elements: BoardElement[];
  /** 批量笔触的作用范围：全部选中元素 */
  sketchTargets: BoardElement[];
  onChange: (elements: BoardElement[]) => void;
}

const MultiSelectSetter = memo((props: MultiSelectSetterProps) => {
  const { t } = useAttributeI18n();
  const { elements, sketchTargets, onChange } = props;
  const canAlign = elements.length > 1;

  const zoom = useZoom();
  const board = useBoard();
  const canMergeHandwrite = isMergeableHandwriteSelection(elements);
  const sharedHandwriteGroupId = getSharedHandwriteGroupId(elements);
  const canSplitHandwrite =
    elements.length > 1 && elements.every(isHandwriteElement) && !!sharedHandwriteGroupId;

  const handleMergeHandwrite = useMemoizedFn(() => {
    if (!canMergeHandwrite) {
      toast.warning(t("attributes.handwrite.mergeUnavailable"));
      return;
    }
    const mergedElements = applyHandwriteGroupIdPatch(elements, getUuid());
    onChange(mergedElements);
    toast.success(t("attributes.handwrite.merged", { count: mergedElements.length }));
  });

  const handleSplitHandwriteGroup = useMemoizedFn(() => {
    if (!canSplitHandwrite) {
      toast.warning(t("attributes.handwrite.splitUnavailable"));
      return;
    }
    const splitElements = applyHandwriteGroupIdPatch(elements, null);
    onChange(splitElements);
    toast.success(t("attributes.handwrite.splitResult", { count: splitElements.length }));
  });

  // 左对齐，按照最左边的元素，设置相同的 x
  const handleAlignLeft = useMemoizedFn(() => {
    if (elements.length <= 1) return;

    const minX = Math.min(...elements.map(el => el.x));
    const newElements = elements
      .map(el => {
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

    const maxRight = Math.max(...elements.map(el => el.x + el.width));
    const newElements = elements
      .map(el => {
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

    const minY = Math.min(...elements.map(el => el.y));
    const newElements = elements
      .map(el => {
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

    const maxBottom = Math.max(...elements.map(el => el.y + el.height));
    const newElements = elements
      .map(el => {
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
    <>
      {canAlign && (
        <>
          <AttrAction
            label={t("attributes.align.left")}
            icon={<AlignStartVertical strokeWidth={1.75} />}
            onClick={handleAlignLeft}
          />
          <AttrAction
            label={t("attributes.align.right")}
            icon={<AlignEndVertical strokeWidth={1.75} />}
            onClick={handleAlignRight}
          />
          <AttrAction
            label={t("attributes.align.top")}
            icon={<AlignStartHorizontal strokeWidth={1.75} />}
            onClick={handleAlignTop}
          />
          <AttrAction
            label={t("attributes.align.bottom")}
            icon={<AlignEndHorizontal strokeWidth={1.75} />}
            onClick={handleAlignBottom}
          />
          <AttrAction
            label={t("attributes.distribute.horizontal")}
            icon={<AlignHorizontalDistributeCenter strokeWidth={1.75} />}
            onClick={handleDistributeHorizontal}
          />
          <AttrAction
            label={t("attributes.distribute.vertical")}
            icon={<AlignVerticalDistributeCenter strokeWidth={1.75} />}
            onClick={handleDistributeVertical}
          />
        </>
      )}
      {/* 手写合并 / 拆分只在选区满足条件时出现，不摆禁用态 */}
      {(canMergeHandwrite || canSplitHandwrite) && <ChromeGap />}
      {canMergeHandwrite && (
        <AttrAction
          label={t("attributes.handwrite.merge")}
          icon={<Link2 strokeWidth={1.75} />}
          onClick={handleMergeHandwrite}
        />
      )}
      {canSplitHandwrite && (
        <AttrAction
          label={t("attributes.handwrite.split")}
          icon={<Ungroup strokeWidth={1.75} />}
          onClick={handleSplitHandwriteGroup}
        />
      )}
      {canAlign && <ChromeGap />}
      <MultiSketchPopover elements={sketchTargets} />
    </>
  );
});

export default MultiSelectSetter;
