import { memo, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import classnames from "classnames";
import { RightOutlined } from "@ant-design/icons";

import { ContextMenuItem, EditorContextMenuProps } from "./types";
import styles from "./index.module.less";

const EditorContextMenu = memo(
  ({ visible, position, items, onClose, readonly }: EditorContextMenuProps) => {
    const menuRef = useRef<HTMLDivElement>(null);
    const [openKeys, setOpenKeys] = useState<string[]>([]);
    const [calculatedPosition, setCalculatedPosition] = useState(position);
    const subMenuPositionsRef = useRef<
      Map<string, { left: boolean; top: string }>
    >(new Map());
    const isCalculatingRef = useRef(false);

    // 边界检测和位置计算
    useEffect(() => {
      if (!visible || !menuRef.current || isCalculatingRef.current) return;

      const menu = menuRef.current;
      const menuRect = menu.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const gap = 8;

      let { x, y } = position;

      // 右侧空间不足，向左偏移
      if (x + menuRect.width > viewportWidth - gap) {
        x = viewportWidth - menuRect.width - gap;
      }

      // 底部空间不足，向上偏移
      if (y + menuRect.height > viewportHeight - gap) {
        y = viewportHeight - menuRect.height - gap;
      }

      // 确保不超出左上边界
      x = Math.max(gap, x);
      y = Math.max(gap, y);

      setCalculatedPosition({ x, y });
    }, [visible, position]);

    // 单独处理子菜单位置计算，使用 requestAnimationFrame 防止抖动
    useEffect(() => {
      if (!visible || !menuRef.current || openKeys.length === 0) return;

      const calculateSubMenuPositions = () => {
        if (isCalculatingRef.current) return;
        isCalculatingRef.current = true;

        const menu = menuRef.current;
        if (!menu) {
          isCalculatingRef.current = false;
          return;
        }

        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const gap = 8;

        // 只处理当前打开的子菜单
        const subMenus = menu.querySelectorAll("[data-submenu]");
        const newPositions = new Map<string, { left: boolean; top: string }>();

        subMenus.forEach((subMenu) => {
          const subMenuElement = subMenu as HTMLElement;
          const subMenuKey = subMenuElement.dataset.submenuKey;
          if (!subMenuKey || !openKeys.includes(subMenuKey)) return;

          const parentWrapper =
            subMenuElement.parentElement as HTMLElement | null;
          if (!parentWrapper) return;

          const triggerElement = parentWrapper.querySelector("button");
          const anchorRect =
            triggerElement?.getBoundingClientRect() ??
            parentWrapper.getBoundingClientRect();
          const subMenuRect = subMenuElement.getBoundingClientRect();

          // 获取之前计算的位置
          const prevPosition = subMenuPositionsRef.current.get(subMenuKey);

          // 基于默认（向右、top 为 0）的布局来判断是否会溢出，从而避免因为位置被调整后反复抖动
          const defaultRightEdge = anchorRect.right + gap + subMenuRect.width;
          const shouldBeLeft = defaultRightEdge > viewportWidth - gap;

          let topOffset = "0";
          const defaultBottomEdge = anchorRect.top + subMenuRect.height;
          if (defaultBottomEdge > viewportHeight - gap) {
            const overflowBottom = defaultBottomEdge - (viewportHeight - gap);
            const availableUpwardSpace = Math.max(0, anchorRect.top - gap);
            const maxUpwardShift = Math.min(
              overflowBottom,
              availableUpwardSpace,
            );
            if (maxUpwardShift > 0) {
              topOffset = `-${maxUpwardShift}px`;
            }
          }

          // 只在位置真正变化时才更新 DOM
          if (
            !prevPosition ||
            prevPosition.left !== shouldBeLeft ||
            prevPosition.top !== topOffset
          ) {
            if (shouldBeLeft) {
              subMenuElement.classList.add(styles.subMenuLeft);
            } else {
              subMenuElement.classList.remove(styles.subMenuLeft);
            }
            subMenuElement.style.top = topOffset;

            newPositions.set(subMenuKey, {
              left: shouldBeLeft,
              top: topOffset,
            });
          } else {
            newPositions.set(subMenuKey, prevPosition);
          }
        });

        subMenuPositionsRef.current = newPositions;
        isCalculatingRef.current = false;
      };

      const rafId = requestAnimationFrame(calculateSubMenuPositions);

      return () => {
        if (rafId) cancelAnimationFrame(rafId);
        isCalculatingRef.current = false;
      };
    }, [visible, openKeys]);

    // 点击外部关闭
    useEffect(() => {
      if (!visible) return;

      const handleClickOutside = (e: MouseEvent) => {
        if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
          onClose();
        }
      };

      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }, [visible, onClose]);

    // 重置子菜单状态
    useEffect(() => {
      if (!visible) {
        setOpenKeys([]);
        subMenuPositionsRef.current.clear();
      }
    }, [visible]);

    if (!visible) return null;

    const handleItemSelect = (item: ContextMenuItem, hasChildren: boolean) => {
      if (item.disabled || hasChildren) return;
      item.onSelect?.();
      onClose();
    };

    const handleItemWrapperEnter = (key: string, hasChildren: boolean) => {
      if (hasChildren) {
        // 保留当前路径上的所有祖先键，添加新的键
        setOpenKeys((prev) => {
          // 如果已经包含，不需要重复添加
          if (prev.includes(key)) return prev;
          // 添加新的键到路径中
          return [...prev, key];
        });
      }
    };

    const handleItemWrapperLeave = (key: string, hasChildren: boolean) => {
      if (hasChildren && openKeys.includes(key)) {
        // 移除当前键及其所有后代键
        setOpenKeys((prev) => {
          const keyIndex = prev.indexOf(key);
          if (keyIndex === -1) return prev;
          // 只保留此键之前的祖先键
          return prev.slice(0, keyIndex);
        });
      }
    };

    const renderMenu = (items: ContextMenuItem[], level = 0) => (
      <div className={styles.menuList}>
        {items.map((item) => {
          if (!item) return null;

          const hasChildren =
            Array.isArray(item.children) && item.children.length > 0;
          const isOpen = openKeys.includes(item.key);

          const itemClass = classnames(styles.menuItem, {
            [styles.menuItemDanger]: item.danger,
            [styles.menuItemDisabled]: item.disabled,
          });

          return (
            <div
              key={item.key}
              className={styles.menuItemWrapper}
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
                  <span className={styles.menuItemIcon}>{item.icon}</span>
                )}
                <span className={styles.menuItemLabel}>{item.label}</span>
                {hasChildren && (
                  <span className={styles.menuItemArrow}>
                    <RightOutlined />
                  </span>
                )}
              </button>

              {/* 子菜单：支持多级嵌套 */}
              {hasChildren && level < 3 && (
                <>
                  {/* 安全三角区 */}
                  <div
                    className={classnames(styles.safeArea, {
                      [styles.safeAreaVisible]: isOpen,
                    })}
                  />
                  {/* 子菜单 */}
                  <div
                    className={classnames(styles.subMenu, {
                      [styles.subMenuVisible]: isOpen,
                      [styles.subMenuLeft]: false, // 将在 useEffect 中动态计算
                    })}
                    data-submenu
                    data-submenu-key={item.key}
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

    const stopPropagationOnly = (event: React.SyntheticEvent) => {
      event.stopPropagation();
    };

    if (readonly) {
      return null;
    }

    return createPortal(
      <div
        ref={menuRef}
        className={styles.menu}
        style={{
          left: `${calculatedPosition.x}px`,
          top: `${calculatedPosition.y}px`,
        }}
        onPointerDown={stopAll}
        onPointerUp={stopAll}
        onClick={stopAll}
        onDoubleClick={stopAll}
        onContextMenu={stopAll}
        onWheel={stopPropagationOnly}
      >
        {items.length > 0 ? (
          renderMenu(items)
        ) : (
          <div className={styles.empty}>暂无可用操作</div>
        )}
      </div>,
      document.body,
    );
  },
);

EditorContextMenu.displayName = "EditorContextMenu";

export default EditorContextMenu;
