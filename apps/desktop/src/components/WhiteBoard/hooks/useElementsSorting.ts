import { useMemo } from "react";
import { BoardElement, Selection } from "../types";

/**
 * 对元素进行分组和排序的 hook
 */
const useElementsSorting = (children: BoardElement[], selection: Selection) => {
  return useMemo(() => {
    // 分组：中心连接元素和非中心连接元素
    // 使用属性检查而非类型检查，支持任何具有连接点的元素类型
    const isCenterConnectAndNotSelected = (element: BoardElement) => {
      const isCenterConnect =
        element.source?.connectId === "center" ||
        element.target?.connectId === "center";
      const isSelected = selection.selectedElements.some(
        (selectedElement) => selectedElement.id === element.id,
      );
      return isCenterConnect && !isSelected;
    };

    const centerConnectArrows = children.filter(isCenterConnectAndNotSelected);
    const noneCenterConnectArrows = children.filter(
      (element) => !isCenterConnectAndNotSelected(element),
    );

    return {
      centerConnectArrows,
      noneCenterConnectArrows,
    };
  }, [children, selection]);
};

export default useElementsSorting;
