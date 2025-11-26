import { memo, useMemo, RefObject, useEffect, useState } from "react";
import type { ReactNode } from "react";
import classnames from "classnames";
import { RightOutlined } from "@ant-design/icons";

import { Board, BoardContextMenuPayload } from "../../types";
import { useContextMenu } from "../../hooks/useContextMenu";
import styles from "../../index.module.less";

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
  containerRef: RefObject<HTMLDivElement>;
  readonly?: boolean;
  buildMenuItems: (params: BuildMenuItemsParams) => ContextMenuItem[];
}

const ContextMenuLayer = memo(
  ({
    board,
    containerRef,
    readonly,
    buildMenuItems,
  }: ContextMenuLayerProps) => {
    const { state, hide } = useContextMenu(board, containerRef);
    const [openKeys, setOpenKeys] = useState<string[]>([]);

    useEffect(() => {
      if (!state) {
        setOpenKeys([]);
      }
    }, [state]);

    const menuItems = useMemo(() => {
      if (!state) return [];
      return buildMenuItems({
        context: state.context,
        board,
        hide,
        readonly,
      });
    }, [state, buildMenuItems, board, hide, readonly]);

    if (!state) return null;

    const handleItemSelect = (item: ContextMenuItem, hasChildren: boolean) => {
      if (item.disabled || hasChildren) return;
      item.onSelect?.();
      hide();
    };

    // 鼠标进入菜单项容器（包括子菜单和安全三角区）
    const handleItemWrapperEnter = (key: string, hasChildren: boolean) => {
      if (hasChildren) {
        setOpenKeys([key]);
      }
    };

    // 鼠标离开菜单项容器
    const handleItemWrapperLeave = (key: string, hasChildren: boolean) => {
      if (hasChildren && openKeys.includes(key)) {
        setOpenKeys([]);
      }
    };

    const renderMenu = (items: ContextMenuItem[], level = 0) => (
      <div className={styles.contextMenuList}>
        {items.map((item) => {
          if (!item) return null;
          const hasChildren =
            Array.isArray(item.children) && item.children.length > 0;
          const itemClass = classnames(styles.contextMenuItemButton, {
            [styles.contextMenuItemDanger]: item.danger,
            [styles.contextMenuItemDisabled]: item.disabled,
            [styles.contextMenuItemWithChildren]: hasChildren,
          });
          const isOpen = openKeys.includes(item.key);

          return (
            <div
              key={item.key}
              className={styles.contextMenuItemWrapper}
              onMouseEnter={() => handleItemWrapperEnter(item.key, hasChildren)}
              onMouseLeave={() => handleItemWrapperLeave(item.key, hasChildren)}
            >
              <button
                type="button"
                className={itemClass}
                onClick={() => handleItemSelect(item, hasChildren)}
                disabled={item.disabled}
              >
                {item.icon && (
                  <span className={styles.contextMenuItemIcon}>
                    {item.icon}
                  </span>
                )}
                <span className={styles.contextMenuItemLabel}>
                  {item.label}
                </span>
                {item.shortcut && (
                  <span className={styles.contextMenuShortcut}>
                    {item.shortcut}
                  </span>
                )}
                {hasChildren && (
                  <span className={styles.contextMenuArrow}>
                    <RightOutlined />
                  </span>
                )}
              </button>
              {hasChildren && level < 2 && (
                <>
                  {/* 安全三角区：覆盖父菜单项到子菜单之间的间隙 */}
                  <div
                    className={classnames(styles.contextMenuSafeArea, {
                      [styles.contextMenuSafeAreaVisible]: isOpen,
                    })}
                  />
                  <div
                    className={classnames(styles.contextMenuSubMenu, {
                      [styles.contextMenuSubMenuVisible]: isOpen,
                    })}
                  >
                    {renderMenu(item.children!, level + 1)}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    );

    const stopAll = (event: React.SyntheticEvent) => {
      event.stopPropagation();
      event.preventDefault();
    };

    return (
      <div
        className={styles.contextMenu}
        style={{
          left: `${state.position.x}px`,
          top: `${state.position.y}px`,
        }}
        onPointerDown={stopAll}
        onPointerUp={stopAll}
        onClick={stopAll}
        onDoubleClick={stopAll}
        onContextMenu={stopAll}
        onWheel={stopAll}
      >
        {menuItems.length > 0 ? (
          renderMenu(menuItems)
        ) : (
          <div className={styles.contextMenuEmpty}>暂无可用操作</div>
        )}
      </div>
    );
  },
);

ContextMenuLayer.displayName = "ContextMenuLayer";

export default ContextMenuLayer;
