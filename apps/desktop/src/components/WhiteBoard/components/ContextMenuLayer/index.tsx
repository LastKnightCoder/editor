import { memo, useMemo, RefObject } from "react";
import type { ReactNode } from "react";
import { Menu } from "@tau/ui";

import { Board, BoardContextMenuPayload } from "../../types";
import { useContextMenu } from "../../hooks/useContextMenu";
import { stopCanvasEvents } from "../../chrome";

export interface ContextMenuItem {
  key: string;
  label: string;
  icon?: ReactNode;
  shortcut?: string;
  description?: string;
  danger?: boolean;
  disabled?: boolean;
  children?: ContextMenuItem[];
  onSelect?: () => void;
}

export interface BuildMenuItemsParams {
  context: BoardContextMenuPayload;
  board: Board;
  hide: () => void;
  readonly?: boolean;
}

interface ContextMenuLayerProps {
  board: Board;
  containerRef: RefObject<HTMLDivElement | null>;
  readonly?: boolean;
  buildMenuItems: (params: BuildMenuItemsParams) => ContextMenuItem[];
}

function renderItems(items: ContextMenuItem[]): ReactNode {
  return items.filter(Boolean).map(item =>
    item.children && item.children.length > 0 ? (
      <Menu.Submenu key={item.key} label={item.label} icon={item.icon} disabled={item.disabled}>
        {renderItems(item.children)}
      </Menu.Submenu>
    ) : (
      <Menu.Item
        key={item.key}
        icon={item.icon}
        kbd={item.shortcut}
        danger={item.danger}
        disabled={item.disabled}
        onSelect={item.onSelect}
      >
        {item.label}
      </Menu.Item>
    )
  );
}

/**
 * 画布右键菜单（D-049）：插件按上下文给出条目，渲染走 Menu 公共件（子菜单、键盘、外点关闭、
 * 视口内翻转都由公共件承担）。锚点 = 右键命中点处的 0 尺寸占位。
 * fit：条目多，主层与子层都尽量展开到视口高度，不出滚动条。
 */
const ContextMenuLayer = memo(
  ({ board, containerRef, readonly, buildMenuItems }: ContextMenuLayerProps) => {
    const { context, hide } = useContextMenu(board);

    const menuItems = useMemo(() => {
      if (!context) return [];
      return buildMenuItems({ context, board, hide, readonly });
    }, [context, buildMenuItems, board, hide, readonly]);

    if (!context) return null;
    const rect = containerRef.current?.getBoundingClientRect();
    const x = context.clientX - (rect?.left ?? 0);
    const y = context.clientY - (rect?.top ?? 0);

    return (
      // 浮层经 portal 渲染，但 React 事件仍沿组件树冒泡：在这里截住，免得落到画布容器的指针处理
      <div className="contents" {...stopCanvasEvents}>
        <Menu
          open
          fit
          onOpenChange={open => !open && hide()}
          trigger={
            <span
              aria-hidden
              tabIndex={-1}
              className="pointer-events-none absolute size-0"
              style={{ left: x, top: y }}
            />
          }
        >
          {menuItems.length > 0 ? (
            renderItems(menuItems)
          ) : (
            <Menu.Item disabled>暂无可用操作</Menu.Item>
          )}
        </Menu>
      </div>
    );
  }
);

ContextMenuLayer.displayName = "ContextMenuLayer";

export default ContextMenuLayer;
