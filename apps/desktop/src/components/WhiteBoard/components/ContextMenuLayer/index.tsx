import {
  memo,
  useMemo,
  RefObject,
  useEffect,
  useState,
  useRef,
  useLayoutEffect,
} from "react";
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
  containerRef: RefObject<HTMLDivElement | null>;
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
    const menuRef = useRef<HTMLDivElement>(null);
    const [adjustedPosition, setAdjustedPosition] = useState<{
      x: number;
      y: number;
    } | null>(null);

    const menuItems = useMemo(() => {
      if (!state) return [];
      return buildMenuItems({
        context: state.context,
        board,
        hide,
        readonly,
      });
    }, [state, buildMenuItems, board, hide, readonly]);

    useEffect(() => {
      if (!state) {
        setOpenKeys([]);
        setAdjustedPosition(null);
      }
    }, [state]);

    // 计算菜单位置，确保不被容器截断
    useLayoutEffect(() => {
      if (!state || !menuRef.current || !containerRef.current) return;

      const menuRect = menuRef.current.getBoundingClientRect();
      const containerRect = containerRef.current.getBoundingClientRect();

      // 底部和右侧的最小安全距离
      const BOTTOM_SPACING = 16;
      const RIGHT_SPACING = 16;

      // 计算容器的可用空间
      const containerWidth = containerRect.width;
      const containerHeight = containerRect.height;

      let x = state.position.x;
      let y = state.position.y;

      // 检查右侧是否超出容器
      if (x + menuRect.width > containerWidth - RIGHT_SPACING) {
        x = Math.max(
          RIGHT_SPACING,
          containerWidth - menuRect.width - RIGHT_SPACING,
        );
      }

      // 检查底部是否超出容器
      if (y + menuRect.height > containerHeight - BOTTOM_SPACING) {
        y = Math.max(
          BOTTOM_SPACING,
          containerHeight - menuRect.height - BOTTOM_SPACING,
        );
      }

      setAdjustedPosition({ x, y });
    }, [state, menuItems.length, containerRef]);

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

    // 使用调整后的位置，如果还没计算则使用原始位置
    const position = adjustedPosition || state.position;

    return (
      <div
        ref={menuRef}
        className={styles.contextMenu}
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
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
