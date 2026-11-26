import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  memo,
  ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { Editor, Range } from "slate";
import {
  useSlateSelector,
  useSlateStatic,
  useSlateSelection,
  useReadOnly,
  ReactEditor,
} from "slate-react";
import { useLocalStorageState } from "ahooks";
import { sortBy } from "lodash";
import { Ellipsis, Type } from "lucide-react";
import { cn } from "@tau/ui";

import { IConfigItem } from "../../types";
import CompactGroupMenu from "./CompactGroupMenu";
import { HoveringBarContext } from "./context";
import {
  buildCompactLayoutItems,
  COMPACT_MORE_GROUP_ID,
  COMPACT_TEXT_STYLE_GROUP_ID,
} from "./compactLayout";
import { calculateFloatingPosition } from "./floatingPosition";

import { menuGlassClass } from "../EditorContextMenu/menuClasses";

const Portal = ({ children }: { children: ReactNode }) => {
  return createPortal(children, document.body);
};

const VIEWPORT_GAP = 8;

/**
 * 工具条分组按 order 区间划分：字形（<10）/ 颜色（10–19）/ 引用关系（20–89）/ AI（≥90）；
 * 相邻两项跨组时插一根短竖线作分组节拍。
 */
const toolbarGroupOf = (order: number) => (order < 10 ? 0 : order < 20 ? 1 : order < 90 ? 2 : 3);

const renderToolbarItems = (configs: IConfigItem[], keyPrefix = "") =>
  configs.map((config, index) => {
    const { element: Element, id } = config;
    const previous = configs[index - 1];
    const crossesGroup =
      previous !== undefined && toolbarGroupOf(previous.order) !== toolbarGroupOf(config.order);
    return (
      <Fragment key={`${keyPrefix}${id}`}>
        {crossesGroup && (
          <span aria-hidden className="mx-[3px] h-4 w-px shrink-0 bg-[var(--ed-border)]" />
        )}
        <Element />
      </Fragment>
    );
  });

interface IHoveringToolbarProps {
  configs: IConfigItem[];
}

const hasRange = (editor: Editor) =>
  Boolean(editor.selection && Range.isExpanded(editor.selection));

const HoveringToolbar = memo((props: IHoveringToolbarProps) => {
  const expanded = useSlateSelector(hasRange);
  // 扩展项可能持有已打开的对话框。首次选区前免挂载，激活后保留它们的生命周期。
  const [activated, setActivated] = useState(false);
  useEffect(() => {
    if (expanded) setActivated(true);
  }, [expanded]);
  return expanded || activated ? <SelectionToolbar {...props} /> : null;
});

const SelectionToolbar = memo((props: IHoveringToolbarProps) => {
  const { configs } = props;

  const sortedConfigs: IConfigItem[] = useMemo(() => {
    return sortBy(configs, (config: IConfigItem) => config.order);
  }, [configs]);

  const ref = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);

  const [isHoveringBarShow, setIsHoveringBarShow] = useState<boolean>(false);
  const [isCompact, setIsCompact] = useState<boolean>(false);

  const editor = useSlateStatic();
  const selection = useSlateSelection();
  const readOnly = useReadOnly();

  const [localStoragePosition, setLocalStoragePosition] = useLocalStorageState<{
    top: number;
    left: number;
  }>("hoveringBarPosition", {
    defaultValue: {
      top: 0,
      left: 0,
    },
  });

  const [position, setPosition] = useState<{ left: number; top: number }>(() => {
    if (localStoragePosition) {
      return localStoragePosition;
    }
    return {
      left: 0,
      top: 0,
    };
  });

  const displayedConfigs = useMemo(() => {
    if (!isCompact) {
      return sortedConfigs;
    }

    const layoutItems = buildCompactLayoutItems(sortedConfigs);
    return layoutItems.map(item => {
      if (item.kind === "item") {
        return item.config;
      }

      if (item.id === COMPACT_TEXT_STYLE_GROUP_ID) {
        return {
          id: item.id,
          order: item.order,
          element: () => (
            <CompactGroupMenu
              id="text-style"
              titleMessage="format.textStyles"
              icon={<Type size={16} strokeWidth={2.5} />}
              items={item.items}
            />
          ),
        } as IConfigItem;
      }

      if (item.id === COMPACT_MORE_GROUP_ID) {
        return {
          id: item.id,
          order: item.order,
          element: () => (
            <CompactGroupMenu
              id="more"
              titleMessage="format.more"
              icon={<Ellipsis size={16} strokeWidth={2.5} />}
              items={item.items}
            />
          ),
        } as IConfigItem;
      }

      return {
        id: item.id,
        order: item.order,
        element: () => null,
      } as IConfigItem;
    });
  }, [isCompact, sortedConfigs]);

  const evaluateCompactMode = useCallback(() => {
    if (readOnly || !isHoveringBarShow) {
      return;
    }
    const measureEl = measureRef.current;
    if (!measureEl) {
      return;
    }
    const fullWidth = measureEl.offsetWidth;
    const viewportWidth = Math.round(window.visualViewport?.width ?? window.innerWidth);
    const shouldCompact = fullWidth > viewportWidth - VIEWPORT_GAP * 2;
    setIsCompact(prev => (prev === shouldCompact ? prev : shouldCompact));
  }, [isHoveringBarShow, readOnly]);

  const updateToolbarPosition = useCallback(() => {
    const el = ref.current;

    if (!el || readOnly) {
      return;
    }

    const isCollapsed = selection && Range.isCollapsed(selection);
    const isEmpty = selection && !isCollapsed && Editor.string(editor, selection) === "";
    const close = !selection || isCollapsed || isEmpty;

    if (close) {
      setIsHoveringBarShow(false);
      return;
    }

    const domSelection = window.getSelection();
    if (!domSelection || domSelection.rangeCount <= 0) {
      return;
    }

    const domRange = domSelection.getRangeAt(0);
    const rect = domRange.getBoundingClientRect();

    const viewportWidth = Math.round(window.visualViewport?.width ?? window.innerWidth);
    const viewportHeight = Math.round(window.visualViewport?.height ?? window.innerHeight);
    const nextPosition = calculateFloatingPosition({
      anchorRect: {
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        width: rect.width,
      },
      viewportWidth,
      viewportHeight,
      floatingWidth: el.offsetWidth,
      floatingHeight: el.offsetHeight,
      preferredPlacement: "top",
      gap: VIEWPORT_GAP,
    });
    setPosition({ top: nextPosition.top, left: nextPosition.left });
    setLocalStoragePosition({
      top: nextPosition.top,
      left: nextPosition.left,
    });
    setIsHoveringBarShow(true);
  }, [editor, readOnly, selection, setLocalStoragePosition]);

  useEffect(() => {
    updateToolbarPosition();
  }, [updateToolbarPosition]);

  useEffect(() => {
    if (!isHoveringBarShow || readOnly) {
      return;
    }
    evaluateCompactMode();
    const handleResize = () => {
      evaluateCompactMode();
    };
    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);
    const visualViewport = window.visualViewport;
    visualViewport?.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
      visualViewport?.removeEventListener("resize", handleResize);
    };
  }, [evaluateCompactMode, isHoveringBarShow, readOnly, sortedConfigs]);

  useEffect(() => {
    if (!isHoveringBarShow || readOnly) {
      return;
    }
    updateToolbarPosition();
  }, [isCompact, isHoveringBarShow, readOnly, updateToolbarPosition]);

  useEffect(() => {
    if (!isHoveringBarShow || readOnly) {
      return;
    }
    const handleViewportChange = () => {
      updateToolbarPosition();
    };
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    const visualViewport = window.visualViewport;
    visualViewport?.addEventListener("resize", handleViewportChange);
    visualViewport?.addEventListener("scroll", handleViewportChange);
    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
      visualViewport?.removeEventListener("resize", handleViewportChange);
      visualViewport?.removeEventListener("scroll", handleViewportChange);
    };
  }, [isHoveringBarShow, readOnly, updateToolbarPosition]);

  useEffect(() => {
    if (!isHoveringBarShow) {
      setIsCompact(false);
    }
  }, [isHoveringBarShow]);

  useEffect(() => {
    if (readOnly) return;
    const fn = (e: MouseEvent) => {
      const el = ref.current;
      if (!el || !isHoveringBarShow || !editor.selection) {
        return;
      }
      const target = e.target as Node;
      const editorEl = ReactEditor.toDOMNode(editor, editor);
      if (editorEl.contains(target) || el.contains(target)) {
        return;
      }
      setIsHoveringBarShow(false);
    };
    document.addEventListener("click", fn);
    return () => {
      document.removeEventListener("click", fn);
    };
  }, [editor, readOnly, isHoveringBarShow]);

  const contextValue = useMemo(
    () => ({
      isHoveringBarShow,
      isCompact,
      submenuTrigger: isCompact ? ("click" as const) : ("hover" as const),
    }),
    [isCompact, isHoveringBarShow]
  );

  return (
    <Portal>
      <HoveringBarContext.Provider value={contextValue}>
        <div
          ref={measureRef}
          className="pointer-events-none invisible fixed top-[-10000px] left-[-10000px] z-[-1] flex items-center gap-[2px] border border-solid border-transparent p-[4px]"
          aria-hidden
        >
          {renderToolbarItems(sortedConfigs, "measure-")}
        </div>
        <div
          ref={ref}
          className={cn(
            "pointer-events-none fixed left-[-500px] top-[-1000px] z-[9999] flex items-center gap-[2px] rounded-[12px] border border-solid border-[var(--ed-border)] p-[4px] opacity-0 transition-[opacity,top,left] duration-300 ease-in-out",
            menuGlassClass,
            isHoveringBarShow && !readOnly && "pointer-events-auto opacity-100"
          )}
          style={{
            left: position.left,
            top: position.top,
          }}
          onPointerDown={e => {
            e.stopPropagation();
          }}
        >
          {renderToolbarItems(displayedConfigs)}
        </div>
      </HoveringBarContext.Provider>
    </Portal>
  );
});

export default HoveringToolbar;
export { HoveringBarContext } from "./context";
