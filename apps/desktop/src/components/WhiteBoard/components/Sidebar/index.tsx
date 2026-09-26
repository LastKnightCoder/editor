import React, { useMemo, useState } from "react";
import { useSyncExternalStore } from "react";
import { Search } from "lucide-react";
import { Input } from "@tau/ui";
import { FadeScroll } from "@/components/FadeScroll";
import { BoardElement } from "../../types";
import { useBoard } from "../../hooks";
import { BoardUtil } from "../../utils";
import ResizeableAndHideableSidebar from "../../../ResizableAndHideableSidebar";
import ElementTree from "./tree/ElementTree";
import Node from "./tree/Node";
import { elementLabel } from "./tree/typeMeta";
import { useWhiteboardOutlineStore } from "./outlineStore";

/**
 * 元素树停靠栏：画布纸面内的左栏，和项目文档树同构（同一张纸、右缘淡线兼拖拽边界）。
 * 开关钉在标题栏面包屑（useWhiteboardOutlineStore），这里不放收起按钮。
 */
const Sidebar: React.FC = () => {
  const open = useWhiteboardOutlineStore(s => s.open);
  const width = useWhiteboardOutlineStore(s => s.width);
  const setWidth = useWhiteboardOutlineStore(s => s.setWidth);
  const setDockWidth = useWhiteboardOutlineStore(s => s.setDockWidth);
  const board = useBoard();
  const { children, selection } = useSyncExternalStore(board.subscribe, board.getSnapshot);
  const [query, setQuery] = useState("");
  const selectedIds = useMemo(
    () => new Set(selection.selectedElements.map(e => e.id)),
    [selection]
  );

  const all = useMemo(() => {
    const list: BoardElement[] = [];
    const walk = (items: BoardElement[]) =>
      items.forEach(e => {
        list.push(e);
        if (e.children) walk(e.children as BoardElement[]);
      });
    walk(children as BoardElement[]);
    return list;
  }, [children]);

  // 查找：按行名（与树上显示的一致）匹配，结果平铺
  const q = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!q) return null;
    const lookup = (id: string) => BoardUtil.getElementById(board, id);
    return all.filter(e => elementLabel(e, lookup).toLowerCase().includes(q)).reverse();
  }, [q, all, board]);

  return (
    <ResizeableAndHideableSidebar
      width={width}
      onWidthChange={w => setWidth(w)}
      onActualWidthChange={setDockWidth}
      open={open}
      sidebarPosition="left"
      minWidth={200}
      maxWidth={420}
      disableResize={!open}
      showDivider
      className="h-full flex-none"
    >
      <div aria-hidden={!open} inert={!open} className="flex h-full flex-col pt-1.5">
        <div className="text-tau-body flex h-11 flex-none items-center gap-2 px-4 font-semibold">
          元素
          <span className="text-ink-3 text-tau-sm font-normal tabular-nums">{all.length}</span>
        </div>
        {all.length > 0 && (
          <div className="flex-none px-3 pb-2">
            <Input
              size="sm"
              lead={Search}
              clearable
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Escape") setQuery("");
              }}
              placeholder="查找元素"
            />
          </div>
        )}
        {/* 列表不贴纸面上下缘：视口底部留 10px、内容上下各 6px */}
        <FadeScroll className="mb-2.5 min-h-0 flex-1 overflow-x-hidden py-1.5 pl-2 pr-0.5">
          {all.length === 0 ? (
            <div className="text-ink-3 text-tau-meta px-2 py-2.5">这一页还是空的</div>
          ) : matches ? (
            matches.length ? (
              matches.map(e => (
                <Node key={e.id} element={e} depth={0} selectedIds={selectedIds} flat />
              ))
            ) : (
              <div className="text-ink-3 text-tau-meta px-2 py-2.5">没有匹配的元素</div>
            )
          ) : (
            <ElementTree root={children as BoardElement[]} selectedIds={selectedIds} />
          )}
        </FadeScroll>
      </div>
    </ResizeableAndHideableSidebar>
  );
};

export default Sidebar;
