import { useEffect, useCallback, useRef } from "react";
import { useElementSelection } from "@/components/Slide/context/ElementSelectionContext";

interface ElementSelectorProps {
  /** 编辑器容器的 ref */
  editorContainerRef: React.RefObject<HTMLDivElement>;
}

const cls = {
  overlay:
    "absolute inset-0 z-50 pointer-events-auto cursor-crosshair",
  toolbar:
    "fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 px-4 py-3 bg-white dark:bg-[#1a1f2e] rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700",
  toolbarText: "text-sm text-gray-600 dark:text-gray-300",
  toolbarCount:
    "px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 rounded-lg text-sm font-medium",
  confirmButton:
    "px-4 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-indigo-500 to-purple-500 shadow-lg hover:opacity-90",
  cancelButton:
    "px-4 py-2 rounded-xl text-sm font-medium border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800",
};

// 高亮选中元素的样式
const SELECTED_STYLE = {
  outline: "2px solid #6366f1",
  outlineOffset: "2px",
  backgroundColor: "rgba(99, 102, 241, 0.1)",
};

// 悬停元素的样式
const HOVER_STYLE = {
  outline: "2px dashed #a5b4fc",
  outlineOffset: "2px",
  backgroundColor: "rgba(165, 180, 252, 0.1)",
};

/**
 * ElementSelector - 元素选择覆盖层
 *
 * 功能：
 * 1. 在选择模式下覆盖在编辑器上
 * 2. 监听点击事件，获取元素的 data-slate-path
 * 3. 高亮已选中的元素
 * 4. 提供确认/取消工具栏
 */
const ElementSelector = ({ editorContainerRef }: ElementSelectorProps) => {
  const {
    isSelecting,
    selectedPaths,
    togglePath,
    confirmSelection,
    endSelection,
  } = useElementSelection();

  const hoveredElementRef = useRef<HTMLElement | null>(null);

  // 应用选中样式
  const applySelectedStyles = useCallback(() => {
    const container = editorContainerRef.current;
    if (!container) return;

    // 清除所有选中样式
    const allElements = container.querySelectorAll<HTMLElement>(
      '[data-slate-node="element"]',
    );
    allElements.forEach((el) => {
      el.style.outline = "";
      el.style.outlineOffset = "";
      el.style.backgroundColor = "";
    });

    // 应用选中样式
    selectedPaths.forEach((path) => {
      const el = container.querySelector<HTMLElement>(
        `[data-slate-path="${path}"]`,
      );
      if (el) {
        Object.assign(el.style, SELECTED_STYLE);
      }
    });
  }, [editorContainerRef, selectedPaths]);

  // 监听选中路径变化，更新样式
  useEffect(() => {
    if (isSelecting) {
      applySelectedStyles();
    }
  }, [isSelecting, applySelectedStyles]);

  // 清理函数
  useEffect(() => {
    if (!isSelecting) {
      const container = editorContainerRef.current;
      if (container) {
        const allElements = container.querySelectorAll<HTMLElement>(
          '[data-slate-node="element"]',
        );
        allElements.forEach((el) => {
          el.style.outline = "";
          el.style.outlineOffset = "";
          el.style.backgroundColor = "";
        });
      }
    }
  }, [isSelecting, editorContainerRef]);

  // 处理鼠标移动 - 高亮悬停元素
  const handleMouseMove = useCallback(
    (event: React.MouseEvent) => {
      const container = editorContainerRef.current;
      if (!container) return;

      // 获取鼠标位置下的元素
      const target = document.elementFromPoint(
        event.clientX,
        event.clientY,
      ) as HTMLElement | null;

      if (!target) return;

      // 查找最近的 slate 元素
      const slateElement = target.closest<HTMLElement>(
        '[data-slate-node="element"]',
      );

      // 清除之前的悬停样式
      if (hoveredElementRef.current && hoveredElementRef.current !== slateElement) {
        const prevPath = hoveredElementRef.current.getAttribute("data-slate-path");
        if (prevPath && !selectedPaths.has(prevPath)) {
          hoveredElementRef.current.style.outline = "";
          hoveredElementRef.current.style.outlineOffset = "";
          hoveredElementRef.current.style.backgroundColor = "";
        }
      }

      // 应用悬停样式
      if (slateElement) {
        const path = slateElement.getAttribute("data-slate-path");
        if (path && !selectedPaths.has(path)) {
          Object.assign(slateElement.style, HOVER_STYLE);
        }
        hoveredElementRef.current = slateElement;
      } else {
        hoveredElementRef.current = null;
      }
    },
    [editorContainerRef, selectedPaths],
  );

  // 处理点击 - 选择/取消选择元素
  const handleClick = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const target = document.elementFromPoint(
        event.clientX,
        event.clientY,
      ) as HTMLElement | null;

      if (!target) return;

      // 查找最近的 slate 元素
      const slateElement = target.closest<HTMLElement>(
        '[data-slate-node="element"]',
      );

      if (slateElement) {
        const path = slateElement.getAttribute("data-slate-path");
        if (path) {
          togglePath(path);
        }
      }
    },
    [togglePath],
  );

  // 处理键盘事件
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isSelecting) return;

      if (event.key === "Escape") {
        event.preventDefault();
        endSelection();
      } else if (event.key === "Enter") {
        event.preventDefault();
        confirmSelection();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isSelecting, endSelection, confirmSelection]);

  if (!isSelecting) {
    return null;
  }

  return (
    <>
      {/* 透明覆盖层 */}
      <div
        className={cls.overlay}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
      />

      {/* 底部工具栏 */}
      <div className={cls.toolbar}>
        <span className={cls.toolbarText}>点击选择元素</span>
        <span className={cls.toolbarCount}>
          已选择 {selectedPaths.size} 个
        </span>
        <button className={cls.cancelButton} onClick={endSelection}>
          取消 (Esc)
        </button>
        <button className={cls.confirmButton} onClick={confirmSelection}>
          确认 (Enter)
        </button>
      </div>
    </>
  );
};

export default ElementSelector;
