import { useMemo } from "react";
import { BoardElement, Selection } from "../types";

/**
 * 对元素进行分组和排序的 hook
 */
const useElementsSorting = (children: BoardElement[], selection: Selection) => {
  return useMemo(() => {
    // 分组：中心连接箭头和非中心连接箭头
    const isCenterConnectAndNotSelected = (element: BoardElement) => {
      const isCenterConnectArrow =
        element.type === "arrow" &&
        (element.source?.connectId === "center" ||
          element.target?.connectId === "center");
      const isSelected = selection.selectedElements.some(
        (selectedElement) => selectedElement.id === element.id,
      );
      return isCenterConnectArrow && !isSelected;
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
