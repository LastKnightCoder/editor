import { useTreeI18n } from "../../tree-i18n";
import { Activity, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Search } from "lucide-react";
import { cn, ErrorBoundary, FadeScroll, Input, ResizeHandle } from "@tau/ui";
import { BoardElement } from "../../types";
import { useBoard } from "../../hooks";
import { BoardUtil } from "../../utils";
import { CANVAS_OVERLAY_ATTR } from "../../utils/events";
import ElementTree from "./tree/ElementTree";
import Node from "./tree/Node";
import { elementLabel } from "./tree/typeMeta";
import type { WhiteboardOutline } from "../../extensions/api";

function OutlineContent() {
  const { t } = useTreeI18n();
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
    return all
      .filter(e =>
        elementLabel(e, t, lookup, type => board.extensions?.getElementDefinition(type))
          .toLowerCase()
          .includes(q)
      )
      .reverse();
  }, [q, all, board, t]);

  return (
    <div className="flex h-full flex-col pt-1.5">
      <div className="text-tau-body flex h-11 flex-none items-center gap-2 px-4 font-semibold">
        {t("tree.title")}
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
            placeholder={t("tree.search")}
          />
        </div>
      )}
      {/* 列表不贴纸面上下缘：视口底部留 10px、内容上下各 6px */}
      <FadeScroll className="mb-2.5 min-h-0 flex-1 overflow-x-hidden py-1.5 pr-0.5 pl-2">
        {all.length === 0 ? (
          <div className="text-ink-3 text-tau-meta px-2 py-2.5">{t("tree.empty")}</div>
        ) : matches ? (
          matches.length ? (
            matches.map(e => (
              <Node key={e.id} element={e} depth={0} selectedIds={selectedIds} flat />
            ))
          ) : (
            <div className="text-ink-3 text-tau-meta px-2 py-2.5">{t("tree.noMatch")}</div>
          )
        ) : (
          <ElementTree root={children as BoardElement[]} selectedIds={selectedIds} />
        )}
      </FadeScroll>
    </div>
  );
}

export default function Sidebar({ outline }: { outline?: WhiteboardOutline }) {
  const { t } = useTreeI18n();
  const [localWidth, setLocalWidth] = useState(260);
  const [resizing, setResizing] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const open = outline?.open ?? true;
  const [visited, setVisited] = useState(open);
  useLayoutEffect(() => {
    if (open) setVisited(true);
  }, [open]);
  const width = Math.min(420, Math.max(200, outline?.width ?? localWidth));
  const label = outline?.panel?.label ?? t("tree.outline");
  const onDockWidthChange = outline?.onDockWidthChange;

  useLayoutEffect(() => {
    const dock = ref.current;
    if (!dock || !onDockWidthChange) return;
    const report = () => onDockWidthChange(dock.offsetWidth);
    const observer = new ResizeObserver(report);
    observer.observe(dock);
    report();
    return () => {
      observer.disconnect();
      onDockWidthChange(0);
    };
  }, [onDockWidthChange]);

  return (
    <aside
      ref={ref}
      {...{ [CANVAS_OVERLAY_ATTR]: "" }}
      aria-label={label}
      aria-hidden={!open}
      inert={!open}
      style={{ width: open ? width : 0 }}
      className={cn(
        "relative h-full flex-none overflow-hidden",
        !resizing && "motion-safe:transition-[width] motion-safe:duration-200"
      )}
    >
      <div className={cn("border-line-1 h-full border-r", !open && "invisible")} style={{ width }}>
        {outline?.panel ? (
          <ErrorBoundary key={outline.panel.id}>{outline.panel.content}</ErrorBoundary>
        ) : (
          (visited || open) && (
            <Activity mode={open ? "visible" : "hidden"}>
              <OutlineContent />
            </Activity>
          )
        )}
      </div>
      <ResizeHandle
        value={width}
        min={200}
        max={420}
        side="left"
        label={t("tree.width", { label })}
        onChange={outline?.onWidthChange ?? setLocalWidth}
        onActiveChange={setResizing}
        className="absolute inset-y-0 right-0"
      />
    </aside>
  );
}
