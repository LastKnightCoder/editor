import { useState } from "react";
import { Editor, Element, Path } from "slate";

import { ContextMenuItem } from "../components/EditorContextMenu/types";
import { useInheritedKit } from "../kit/context";
import { resolveBlockMenuItems } from "../menu/resolveMenu";
import { findPathSafely } from "../utils";

export interface UseDragHandlerMenuOptions<T extends Element> {
  element: T;
  editor: Editor;
  /** 过渡：宿主/组件补充的旧形态条目（extraMenuItemsBuilder），打开菜单时求值、追加在末尾 */
  extraItems?: (params: { element: T; editor: Editor; path: Path }) => ContextMenuItem[];
}

/**
 * 手柄点击菜单：数据来自 kit 聚合的扩展菜单声明（01 §5.4），
 * 打开时对目标元素求值一次（when / disabled / 动态标题都是那一刻的快照）。
 */
export function useDragHandlerMenu<T extends Element>(options: UseDragHandlerMenuOptions<T>) {
  const { element, editor, extraItems } = options;
  const kit = useInheritedKit();

  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [menuItems, setMenuItems] = useState<ContextMenuItem[]>([]);

  // 打开时求值：条目反映此刻的元素状态，且平时不为菜单做任何计算
  const handleDragHandlerClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const path = findPathSafely(editor, element);
    const extras = path ? (extraItems?.({ element, editor, path }) ?? []) : [];
    setMenuItems(
      kit && path
        ? resolveBlockMenuItems(kit.assembly.menuSources, { editor, element, path }, extras)
        : extras
    );
    setPosition({ x: e.clientX, y: e.clientY });
    setVisible(true);
  };

  const handleClose = () => {
    setVisible(false);
  };

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
