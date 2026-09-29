import { Fragment, memo, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRight } from "lucide-react";
import { cn } from "@tau/ui";

import { ContextMenuItem, EditorContextMenuProps } from "./types";
import {
  menuGlassClass,
  menuItemArrowClass,
  menuItemClass,
  menuItemWrapperClass,
  menuListClass,
  menuPanelClass,
} from "./menuClasses";

const EditorContextMenu = memo(
  ({ visible, position, items, onClose, readonly }: EditorContextMenuProps) => {
    const menuRef = useRef<HTMLDivElement>(null);
    const [openKeys, setOpenKeys] = useState<string[]>([]);
    const [calculatedPosition, setCalculatedPosition] = useState(position);
    const subMenuPositionsRef = useRef<Map<string, { left: boolean; top: string }>>(new Map());
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

        subMenus.forEach(subMenu => {
          const subMenuElement = subMenu as HTMLElement;
          const subMenuKey = subMenuElement.dataset.submenuKey;
          if (!subMenuKey || !openKeys.includes(subMenuKey)) return;

          const parentWrapper = subMenuElement.parentElement as HTMLElement | null;
          if (!parentWrapper) return;

          const triggerElement = parentWrapper.querySelector("button");
          const anchorRect =
            triggerElement?.getBoundingClientRect() ?? parentWrapper.getBoundingClientRect();
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
            const maxUpwardShift = Math.min(overflowBottom, availableUpwardSpace);
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
            // 右侧空间不足时子菜单翻到左侧，外观由 data-[placement=left] 变体承接
            if (shouldBeLeft) {
              subMenuElement.dataset.placement = "left";
            } else {
              delete subMenuElement.dataset.placement;
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

    const handleItemWrapperEnter = (key: string, hasChildren: boolean, level: number) => {
      setOpenKeys(prev => {
        const nextPath = prev.slice(0, level);
        if (hasChildren) {
          nextPath[level] = key;
        }
        return nextPath;
      });
    };

    const handleItemWrapperLeave = (key: string, hasChildren: boolean, level: number) => {
      if (!hasChildren || openKeys[level] !== key) {
        return;
      }
      setOpenKeys(prev => prev.slice(0, level));
    };

    const renderMenu = (items: ContextMenuItem[], level = 0) => (
      <div className={menuListClass}>
        {items.map(item => {
          if (!item) return null;

          const hasChildren = Array.isArray(item.children) && item.children.length > 0;
          const isOpen = openKeys[level] === item.key;

          const itemClass = cn(
            menuItemClass,
            item.danger && "text-[var(--ed-danger)] enabled:hover:bg-[var(--ed-danger-soft)]",
            item.disabled && "cursor-not-allowed opacity-50"
          );

          return (
            <Fragment key={item.key}>
              {item.separator && (
                <div className="mx-[12px] my-[5px] h-px bg-[var(--ed-border-soft)]" />
              )}
              <div
                className={menuItemWrapperClass}
                onMouseEnter={() => handleItemWrapperEnter(item.key, hasChildren, level)}
                onMouseLeave={() => handleItemWrapperLeave(item.key, hasChildren, level)}
              >
                <button
                  type="button"
                  className={itemClass}
                  onClick={() => handleItemSelect(item, hasChildren)}
                  disabled={item.disabled}
                >
                  {item.icon && (
                    <span className="flex items-center justify-center text-[16px]">
                      {item.icon}
                    </span>
                  )}
                  <span className="flex-1">{item.label}</span>
                  {hasChildren && (
                    <span className={menuItemArrowClass}>
                      <ChevronRight size="1em" />
                    </span>
                  )}
                </button>

                {/* 子菜单：支持多级嵌套 */}
                {hasChildren && level < 3 && (
                  <>
                    {/* 安全三角区 */}
                    <div
                      className={cn(
                        "absolute right-[-8px] top-0 hidden h-full w-[16px]",
                        isOpen && "block"
                      )}
                    />
                    {/* 子菜单 */}
                    <div
                      className={cn(
                        "absolute left-[calc(100%+8px)] top-0 box-border hidden min-w-[160px] max-w-[240px] overflow-visible rounded-[18px] border-[6px] border-solid border-transparent p-[8px]",
                        menuGlassClass,
                        "before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:border before:border-solid before:border-[var(--ed-border-soft)] before:content-['']",
                        "data-[placement=left]:left-auto data-[placement=left]:right-[calc(100%+8px)]",
                        isOpen && "block"
                      )}
                      data-submenu
                      data-submenu-key={item.key}
                    >
                      <div className="flex max-h-[min(24rem,calc(100vh-8rem))] flex-col">
                        {renderMenu(item.children!, level + 1)}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </Fragment>
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
        className={menuPanelClass}
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
          <div className="p-[12px] text-center text-[13px] text-[var(--ed-text-tertiary)]">
            暂无可用操作
          </div>
        )}
      </div>,
      document.body
    );
  }
);

EditorContextMenu.displayName = "EditorContextMenu";

export default EditorContextMenu;
