import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { useSlateStatic } from "slate-react";
import { PortalToBody } from "@tau/shared";
import { cn, FADE_SCROLL_CLASS, useEdgeFade } from "@tau/ui";

import { IBlockPanelListItem } from "../../types";

import useBlockPanelStore from "../../../stores/useBlockPanelStore";
import Item from "../Item";
import {
  menuItemWrapperClass,
  menuListClass,
  menuPanelClass,
} from "../../EditorContextMenu/menuClasses";

// 一级列表与子菜单共用的纵向滚动区：限高 + 边缘渐隐 + 内缩滚动条（同 FadeScroll）。
// pr-[6px] 让菜单项与滚动条留缝；透明右边框收窄到 2px，配合面板 blockPanelScrollPanelClass 使左右留白接近对称。
// thumb 需 !important：@tau/ui styles.css 的全局滚动条是未分层 CSS，会压过 utilities 层
const scrollableMenuClass = cn(
  menuListClass,
  FADE_SCROLL_CLASS,
  "max-h-[min(360px,70vh)] border-r-[2px] pr-[6px] [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-[999px]! [&::-webkit-scrollbar-thumb]:bg-[color-mix(in_oklab,var(--ed-text)_15%,transparent)]! [&::-webkit-scrollbar-thumb:hover]:bg-[color-mix(in_oklab,var(--ed-text)_25%,transparent)]!"
);

/** 承载滚动列表的面板右内边距：右侧间距改由列表的透明边与 pr 提供 */
export const blockPanelScrollPanelClass = "pr-[2px]";

const ScrollableMenu = ({ className, children }: { className?: string; children: ReactNode }) => {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  useEdgeFade(element);
  return (
    <div ref={setElement} className={cn(scrollableMenuClass, className)}>
      {children}
    </div>
  );
};

const buildPathKey = (path: number[]) => path.join("-");
const buildPathKeys = (path: number[]) =>
  path.map((_, index) => buildPathKey(path.slice(0, index + 1)));

const List = memo(() => {
  const editor = useSlateStatic();
  const { list, activePath, selectItem, setActivePath, interactionMode } = useBlockPanelStore(
    state => ({
      list: state.list,
      activePath: state.activePath,
      selectItem: state.selectItem,
      setActivePath: state.setActivePath,
      interactionMode: state.interactionMode,
    })
  );
  const autoScrollEnabled = interactionMode === "keyboard";

  const [openPathKeys, setOpenPathKeys] = useState<string[]>([]);
  const anchorRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());
  const subMenuRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const closeTimersRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    setOpenPathKeys([]);
  }, [list]);

  const closeBranch = useCallback((pathKey: string) => {
    setOpenPathKeys(prev => prev.filter(key => key !== pathKey && !key.startsWith(`${pathKey}-`)));
  }, []);

  const clearCloseTimer = useCallback((pathKey: string) => {
    const timerId = closeTimersRef.current.get(pathKey);
    if (timerId) {
      clearTimeout(timerId);
      closeTimersRef.current.delete(pathKey);
    }
  }, []);

  const clearCloseTimersForPath = useCallback(
    (path: number[]) => {
      for (let i = path.length; i >= 1; i--) {
        const key = buildPathKey(path.slice(0, i));
        clearCloseTimer(key);
      }
    },
    [clearCloseTimer]
  );

  const scheduleClose = useCallback(
    (pathKey: string) => {
      clearCloseTimer(pathKey);
      const timerId = window.setTimeout(() => {
        closeBranch(pathKey);
        closeTimersRef.current.delete(pathKey);
      }, 180);
      closeTimersRef.current.set(pathKey, timerId);
    },
    [clearCloseTimer, closeBranch]
  );

  useEffect(() => {
    return () => {
      closeTimersRef.current.forEach(id => clearTimeout(id));
      closeTimersRef.current.clear();
    };
  }, []);

  const registerAnchor = useCallback((key: string, element: HTMLButtonElement | null) => {
    if (element) {
      anchorRefs.current.set(key, element);
    } else {
      anchorRefs.current.delete(key);
    }
  }, []);

  const registerSubMenu = useCallback((key: string, element: HTMLDivElement | null) => {
    if (element) {
      subMenuRefs.current.set(key, element);
    } else {
      subMenuRefs.current.delete(key);
    }
  }, []);

  const handleItemWrapperEnter = useCallback(
    (path: number[]) => {
      if (path.length === 0) return;
      clearCloseTimersForPath(path);
      setActivePath(path);
      setOpenPathKeys(buildPathKeys(path));
    },
    [clearCloseTimersForPath, setActivePath]
  );

  const handleItemWrapperLeave = useCallback(
    (path: number[], event?: ReactMouseEvent) => {
      const pathKey = buildPathKey(path);
      const relatedTarget = event?.relatedTarget as Node | null;
      if (relatedTarget) {
        const subMenuElement = subMenuRefs.current.get(pathKey);
        if (subMenuElement && subMenuElement.contains(relatedTarget)) {
          return;
        }
      }
      scheduleClose(pathKey);
    },
    [scheduleClose]
  );

  const handleSubMenuLeave = useCallback(
    (path: number[], event?: ReactMouseEvent) => {
      const pathKey = buildPathKey(path);
      const relatedTarget = event?.relatedTarget as Node | null;
      if (relatedTarget) {
        const anchor = anchorRefs.current.get(pathKey);
        if (anchor && anchor.contains(relatedTarget)) {
          return;
        }
        for (const [key, element] of subMenuRefs.current) {
          if (
            key !== pathKey &&
            key.startsWith(`${pathKey}-`) &&
            element?.contains(relatedTarget)
          ) {
            return;
          }
        }
      }
      scheduleClose(pathKey);
    },
    [scheduleClose]
  );

  const handleSubMenuEnter = useCallback(
    (path: number[]) => {
      clearCloseTimersForPath(path);
    },
    [clearCloseTimersForPath]
  );

  const handleItemSelect = useCallback(
    (path: number[], item: IBlockPanelListItem) => {
      const hasChildren = Array.isArray(item.children) && item.children.length > 0;
      if (hasChildren && !item.onClick) {
        setOpenPathKeys(buildPathKeys(path));
        return;
      }

      selectItem(editor, path);
    },
    [editor, selectItem]
  );

  const isSamePath = useCallback((pathA: number[], pathB: number[]) => {
    if (pathA.length !== pathB.length) return false;
    return pathA.every((value, index) => value === pathB[index]);
  }, []);

  const isActiveBranch = useCallback(
    (currentPath: number[]) => {
      if (activePath.length <= currentPath.length) return false;
      return currentPath.every((value, index) => activePath[index] === value);
    },
    [activePath]
  );

  const renderMenu = useCallback(
    (items: IBlockPanelListItem[], path: number[] = [], level = 0) => {
      if (!items || items.length === 0) return null;

      return (
        <ScrollableMenu className={cn(level > 0 && "min-w-[220px]")}>
          {items.map((item, index) => {
            const currentPath = [...path, index];
            const pathKey = buildPathKey(currentPath);
            const hasChildren = Array.isArray(item.children) && item.children.length > 0;
            const isActive = isSamePath(currentPath, activePath);
            const pointerOpen = openPathKeys.includes(pathKey);
            const shouldShowChildren = hasChildren && (pointerOpen || isActiveBranch(currentPath));

            return (
              <div
                key={pathKey}
                className={menuItemWrapperClass}
                onMouseEnter={() => handleItemWrapperEnter(currentPath)}
                onMouseLeave={event => handleItemWrapperLeave(currentPath, event)}
              >
                <Item
                  item={item}
                  active={isActive}
                  hasChildren={hasChildren}
                  shouldAutoScroll={autoScrollEnabled}
                  onAnchorChange={
                    hasChildren ? element => registerAnchor(pathKey, element) : undefined
                  }
                  onClick={() => handleItemSelect(currentPath, item)}
                />

                {hasChildren && (
                  <SubMenuPortal
                    pathKey={pathKey}
                    anchorElement={anchorRefs.current.get(pathKey)}
                    visible={shouldShowChildren}
                    registerPortal={registerSubMenu}
                    onMouseEnter={() => handleSubMenuEnter(currentPath)}
                    onMouseLeave={event => handleSubMenuLeave(currentPath, event)}
                  >
                    {renderMenu(item.children!, currentPath, level + 1)}
                  </SubMenuPortal>
                )}
              </div>
            );
          })}
        </ScrollableMenu>
      );
    },
    [
      activePath,
      autoScrollEnabled,
      handleItemSelect,
      handleItemWrapperEnter,
      handleItemWrapperLeave,
      handleSubMenuEnter,
      handleSubMenuLeave,
      isActiveBranch,
      openPathKeys,
      registerAnchor,
      registerSubMenu,
    ]
  );

  if (list.length === 0) return null;

  return (
    <div className="relative inline-block w-max min-w-[220px] overflow-visible">
      {renderMenu(list)}
    </div>
  );
});

interface SubMenuPortalProps {
  pathKey: string;
  anchorElement: HTMLButtonElement | null | undefined;
  visible: boolean;
  registerPortal: (key: string, element: HTMLDivElement | null) => void;
  onMouseEnter: () => void;
  onMouseLeave: (event: ReactMouseEvent<HTMLDivElement>) => void;
  children: ReactNode;
}

const SubMenuPortal = memo(
  ({
    pathKey,
    anchorElement,
    visible,
    registerPortal,
    onMouseEnter,
    onMouseLeave,
    children,
  }: SubMenuPortalProps) => {
    const panelRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState({ left: 0, top: 0 });

    const updatePosition = useCallback(() => {
      if (!panelRef.current || !anchorElement) return;

      const anchorRect = anchorElement.getBoundingClientRect();
      const menuRect = panelRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const gap = 8;

      let left = anchorRect.right + gap;
      if (left + menuRect.width > viewportWidth - gap) {
        left = Math.max(gap, anchorRect.left - gap - menuRect.width);
      }

      let top = anchorRect.top;
      if (top + menuRect.height > viewportHeight - gap) {
        top = viewportHeight - menuRect.height - gap;
      }
      top = Math.max(gap, top);

      setPosition({ left, top });
    }, [anchorElement]);

    useEffect(() => {
      if (!visible) return;

      updatePosition();
      window.addEventListener("resize", updatePosition);
      return () => {
        window.removeEventListener("resize", updatePosition);
      };
    }, [visible, updatePosition]);

    useEffect(() => {
      if (panelRef.current) {
        registerPortal(pathKey, panelRef.current);
        return () => {
          registerPortal(pathKey, null);
        };
      }
    }, [pathKey, registerPortal, visible]);

    if (!visible || !anchorElement) return null;

    return (
      <PortalToBody>
        <div
          ref={panelRef}
          className={cn(
            menuPanelClass,
            blockPanelScrollPanelClass,
            "fixed z-[10000] min-w-[220px]"
          )}
          style={{
            left: `${position.left}px`,
            top: `${position.top}px`,
          }}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
        >
          {children}
        </div>
      </PortalToBody>
    );
  }
);

List.displayName = "BlockPanelList";

export default List;
