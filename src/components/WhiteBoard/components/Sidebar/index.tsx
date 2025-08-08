import React, { useMemo, useState } from "react";
import { useSyncExternalStore } from "react";
import { BoardElement } from "../../types";
import { useBoard } from "../../hooks";
import ElementTree from "./tree/ElementTree";

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
    <aside
      className={
        collapsed
          ? "h-full w-[2.25rem] shrink-0 border-r border-ui-border bg-sidebar-2nd text-text-primary overflow-hidden flex flex-col"
          : "h-full w-75 shrink-0 border-r border-ui-border bg-sidebar-2nd text-text-primary overflow-auto flex flex-col"
      }
      style={{ background: "var(--second-sidevar-background)" }}
    >
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-sidebar-2nd/90 backdrop-blur-sm border-b border-ui-border flex items-center justify-between px-2 py-2">
        {!collapsed && (
          <div className="text-xs uppercase tracking-wider text-text-secondary">
            元素结构
          </div>
        )}
        <button
          className="ml-auto text-text-secondary hover:text-text-primary px-2 py-1 rounded-md hover:bg-item-hover"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}
        >
          {collapsed ? "❯" : "❮"}
        </button>
      </div>

      {/* Tree list */}
      {!collapsed && (
        <div className="pb-24 pt-2">
          <ElementTree
            root={children as BoardElement[]}
            selectedIds={selectedIds}
            collapsed={false}
          />
        </div>
      )}
    </aside>
  );
};

export default Sidebar;
