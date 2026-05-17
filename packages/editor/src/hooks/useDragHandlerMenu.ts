import { useMemo, useState } from "react";
import { Element } from "slate";

import {
  UseDragHandlerMenuOptions,
  ContextMenuItem,
} from "../components/EditorContextMenu/types";
import { findPathSafely } from "../utils";

export function useDragHandlerMenu<T extends Element>(
  options: UseDragHandlerMenuOptions<T>,
) {
  const { element, editor, buildMenuItems } = options;

  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  // 处理 DragHandler 点击
  const handleDragHandlerClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setPosition({ x: e.clientX, y: e.clientY });
    setVisible(true);
  };

  // 关闭菜单
  const handleClose = () => {
    setVisible(false);
  };

  // 获取当前节点路径
  const path = findPathSafely(editor, element);

  // 构建菜单项
  const menuItems: ContextMenuItem[] = useMemo(
    () => (path ? buildMenuItems({ element, editor, path }) : []),
    [element, editor, path, buildMenuItems],
  );

  return {
    menuProps: {
      visible,
      position,
      items: menuItems,
      onClose: handleClose,
    },
    dragHandlerProps: {
      onClick: handleDragHandlerClick,
    },
  };
}
