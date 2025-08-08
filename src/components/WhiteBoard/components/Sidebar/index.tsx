import React, { useMemo, useState } from "react";
import { useSyncExternalStore } from "react";
import { BoardElement } from "../../types";
import { useBoard } from "../../hooks";
import ElementTree from "./tree/ElementTree";
import { HiChevronLeft, HiChevronRight } from "react-icons/hi2";

const Sidebar: React.FC = () => {
  const board = useBoard();
  const { children, selection } = useSyncExternalStore(
    board.subscribe,
    board.getSnapshot,
  );

  const selectedIds = useMemo(
    () => new Set(selection.selectedElements.map((e) => e.id)),
    [selection],
  );

  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="relative h-full">
      {/* 主侧边栏 */}
      <aside
        className={`
          h-full flex flex-col transition-all duration-500 ease-in-out
          text-text-primary relative overflow-hidden
          ${collapsed ? "w-0" : "w-75"}
        `}
        style={{
          background: collapsed
            ? "transparent"
            : `linear-gradient(180deg, 
            var(--second-sidevar-background) 0%, 
            var(--second-sidevar-background) 100%)`,
          backdropFilter: collapsed ? "none" : "blur(20px)",
          boxShadow: collapsed ? "none" : "2px 0 20px -5px rgba(0, 0, 0, 0.08)",
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onMouseMove={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerMove={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
      >
        {!collapsed && (
          <>
            {/* 简洁头部，无图标 */}
            <div className="px-3 py-3 border-b border-ui-border/30">
              <h2 className="text-sm font-medium text-text-primary">
                元素结构
              </h2>
              <p className="text-xs text-text-secondary mt-0.5">
                {children?.length || 0} 个元素
              </p>
            </div>

            {/* 树形列表 */}
            <div className="flex-1 overflow-hidden px-2">
              <div className="h-full overflow-y-auto overflow-x-hidden custom-scrollbar">
                <div className="py-2 pb-6">
                  <ElementTree
                    root={children as BoardElement[]}
                    selectedIds={selectedIds}
                    collapsed={false}
                  />
                </div>
              </div>
            </div>
          </>
        )}
      </aside>

      {/* 浮动切换按钮 */}
      <button
        className={`
          absolute top-1/2 -translate-y-1/2 z-50 transition-all duration-500 ease-in-out
          w-6 h-12 rounded-r-full
          flex items-center justify-center
          hover:scale-105 active:scale-95
          group
          ${collapsed ? "left-0" : "left-75"}
        `}
        onClick={() => setCollapsed((v) => !v)}
        aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}
        style={{
          background: "var(--text-secondary)",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
        }}
      >
        <div className="text-white transition-transform duration-300 group-hover:scale-110">
          {collapsed ? (
            <HiChevronRight className="w-3 h-3" />
          ) : (
            <HiChevronLeft className="w-3 h-3" />
          )}
        </div>
        {/* 悬浮效果 */}
        <div className="absolute inset-0 rounded-r-full bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </button>

      <style>{`
        .custom-scrollbar {
          scrollbar-width: thin;
          scrollbar-color: rgba(156, 163, 175, 0.3) transparent;
        }

        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }

        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }

        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(156, 163, 175, 0.3);
          border-radius: 2px;
        }

        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(156, 163, 175, 0.5);
        }
      `}</style>
    </div>
  );
};

export default Sidebar;
