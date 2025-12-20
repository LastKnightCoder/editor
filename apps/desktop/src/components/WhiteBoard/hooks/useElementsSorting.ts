import { useMemo } from "react";
import { BoardElement, Selection } from "../types";

/**
 * 对元素进行分组和排序的 hook
 * 渲染顺序（从下到上）：
 * 1. 中心连接且未选中的箭头（最底层）
 * 2. 非中心连接的元素（中间层）
 * 3. 中心连接且被选中的箭头（最顶层）
 */
const useElementsSorting = (children: BoardElement[], selection: Selection) => {
  return useMemo(() => {
    // 检查元素是否具有中心连接
    const isCenterConnect = (element: BoardElement) => {
      return (
        element.source?.connectId === "center" ||
        element.target?.connectId === "center"
      );
    };

    // 检查元素是否被选中
    const isSelected = (element: BoardElement) => {
      return selection.selectedElements.some(
        (selectedElement) => selectedElement.id === element.id,
      );
    };

    // 分为三组
    const centerConnectAndSelected: BoardElement[] = [];
    const centerConnectAndNotSelected: BoardElement[] = [];
    const noneCenterConnect: BoardElement[] = [];

    children.forEach((element) => {
      if (isCenterConnect(element)) {
        if (isSelected(element)) {
          centerConnectAndSelected.push(element);
        } else {
          centerConnectAndNotSelected.push(element);
        }
      } else {
        noneCenterConnect.push(element);
      }
    });

    return {
      // 中心连接且未选中的箭头（最底层）
      centerConnectArrows: centerConnectAndNotSelected,
      // 非中心连接的元素（中间层）
      noneCenterConnectArrows: noneCenterConnect,
      // 中心连接且被选中的箭头（最顶层）
      centerConnectAndSelectedArrows: centerConnectAndSelected,
    };
  }, [children, selection]);
};

export default useElementsSorting;
