/**
 * 素材架：停靠在画布纸面左侧的检索栏，开关在白板页面的面包屑（useWhiteboardShelfStore）。
 * - 选中一张文档卡时，顶部多出「和它相关」一组；其余是最近编辑或搜索结果，类型可筛；
 * - 拖到画布上放下；拖到某张卡上就放在它旁边并连线（落点判定在 materialDrag）；
 * - ⌘ 点选多篇后成叠拖入；已在板上的条目带圆点，点一下镜头飞到那张卡；
 * 根节点带 CANVAS_OVERLAY_ATTR：栏内的按键、滚轮、指针不归画布。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useDebounce, useMemoizedFn } from "ahooks";
import { GripVertical, Search } from "lucide-react";
import { cn, Loading, useEdgeFade } from "@tau/ui";
import {
  CANVAS_OVERLAY_ATTR,
  ViewPortTransforms,
  useBoard,
  useSelection,
  type DocumentElement,
} from "@tau/whiteboard";
import { searchEntities } from "@/commands";
import { EntityKindIcon } from "@/components/EntityKind/EntityKindIcon";
import { ENTITY_KIND_META } from "@/components/EntityPicker/meta";
import type { EntityKind } from "@/types";
import { useWhiteboardShelfStore } from "../../shelfStore";
import {
  INSERTABLE_KINDS,
  findPlacedDocument,
  placedKeys,
  toMaterialOption,
  type MaterialOption,
} from "./insert";
import { useRelated } from "./related";
import { setMaterialDrag } from "./materialDrag";
import { useDocumentHost } from "./DocumentHostContext";

const SHELF_WIDTH = 264;

function Row({
  option,
  placed,
  picked,
  onPick,
  onLocate,
  onDragStart,
}: {
  option: MaterialOption;
  placed: boolean;
  picked: boolean;
  onPick(): void;
  onLocate(): void;
  onDragStart(event: React.DragEvent): void;
}) {
  return (
    <div
      role="option"
      aria-selected={picked}
      draggable
      onDragStart={onDragStart}
      onClick={event => {
        if (event.metaKey || event.ctrlKey) onPick();
        else if (placed) onLocate();
      }}
      title={placed ? "已在白板上，点一下定位" : "拖到画布上放置，⌘ 点选可多选"}
      className={cn(
        "group flex cursor-grab items-center gap-2 rounded-[8px] px-2 py-[7px] active:cursor-grabbing",
        picked ? "bg-selected" : "hover:bg-hover"
      )}
    >
      <EntityKindIcon
        entityRef={option.entityRef}
        fallback={ENTITY_KIND_META[option.kind]}
        className="text-ink-3 size-[14px] shrink-0"
        strokeWidth={1.75}
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn("truncate text-[13px]", placed ? "text-ink-3" : "text-ink-1")}>
          {option.title || "无标题"}
        </span>
        {option.note && <span className="text-ink-3 truncate text-[11.5px]">{option.note}</span>}
      </span>
      {placed ? (
        <span aria-label="已在白板上" className="bg-accent size-1.5 shrink-0 rounded-full" />
      ) : (
        <GripVertical
          className="text-ink-3 size-3.5 shrink-0 opacity-0 group-hover:opacity-100"
          strokeWidth={1.75}
        />
      )}
    </div>
  );
}

function Shelf() {
  const board = useBoard();
  const selection = useSelection();
  const [keyword, setKeyword] = useState("");
  const debounced = useDebounce(keyword, { wait: 150 });
  const [kind, setKind] = useState<EntityKind | null>(null);
  const [picked, setPicked] = useState<Map<string, MaterialOption>>(() => new Map());
  const [listEl, setListEl] = useState<HTMLDivElement | null>(null);
  const stackRef = useRef<HTMLDivElement>(null);
  const [dragCount, setDragCount] = useState(0);
  useEdgeFade(listEl);
  const now = useRef(Date.now()).current;
  const children = board.children;
  const placed = useMemo(() => placedKeys({ children }), [children]);

  const selectedCard = useMemo(() => {
    const selected = selection?.selectedElements ?? [];
    return selected.length === 1 && selected[0].type === "document"
      ? (selected[0] as DocumentElement)
      : null;
  }, [selection]);
  const related = useRelated(selectedCard);
  const search = useQuery({
    queryKey: ["whiteboard-shelf-search", kind ?? INSERTABLE_KINDS, debounced],
    queryFn: () =>
      searchEntities({ kind: kind ?? INSERTABLE_KINDS, keyword: debounced, limit: 40 }),
    staleTime: 10_000,
    placeholderData: keepPreviousData,
  });

  const groups = useMemo(() => {
    const results = (search.data ?? [])
      .map(candidate => toMaterialOption(candidate, now))
      .filter((option): option is MaterialOption => option !== null);
    const relatedOptions =
      debounced.trim() || !selectedCard
        ? []
        : (related.data ?? [])
            .filter(item => !kind || item.kind === kind)
            .map((item): MaterialOption => ({
              entityRef: item.entityRef,
              title: item.title,
              key: item.key,
              kind: item.kind,
              note: item.reason,
            }));
    const relatedKeys = new Set(relatedOptions.map(option => option.key));
    return [
      ...(relatedOptions.length
        ? [{ name: `和「${selectedCard?.title || "选中的文档"}」相关`, options: relatedOptions }]
        : []),
      {
        name: debounced.trim() ? "搜索结果" : "最近编辑",
        options: results.filter(option => !relatedKeys.has(option.key)),
      },
    ].filter(group => group.options.length > 0);
  }, [search.data, related.data, debounced, kind, selectedCard, now]);

  const togglePick = (option: MaterialOption) =>
    setPicked(previous => {
      const next = new Map(previous);
      if (next.has(option.key)) next.delete(option.key);
      else next.set(option.key, option);
      return next;
    });

  const locate = useMemoizedFn((option: MaterialOption) => {
    const element = findPlacedDocument(board, option);
    if (!element) return;
    board.select([element.id]);
    ViewPortTransforms.centerElementsIfNotInViewPort(board, [element]);
    board.flashElement(element.id);
  });

  // 拖已勾选的一行时整叠一起拖；拖没勾选的只拖它自己
  const dragStart = useMemoizedFn((option: MaterialOption, event: React.DragEvent) => {
    const stack = picked.has(option.key) ? [...picked.values()] : [option];
    setDragCount(stack.length);
    setMaterialDrag(
      event,
      { targets: stack.map(({ entityRef, title }) => ({ entityRef, title })) },
      stack.length > 1 ? stackRef.current : null
    );
  });
  useEffect(() => {
    const clear = () => setPicked(new Map());
    const onDragEnd = () => {
      setDragCount(0);
      clear();
    };
    listEl?.addEventListener("dragend", onDragEnd);
    return () => listEl?.removeEventListener("dragend", onDragEnd);
  }, [listEl]);

  return (
    <aside
      {...{ [CANVAS_OVERLAY_ATTR]: "" }}
      aria-label="素材架"
      onKeyDown={event => {
        if (event.key === "Escape" && picked.size) {
          event.stopPropagation();
          setPicked(new Map());
        }
      }}
      className="bg-surface border-line-1 pointer-events-auto absolute top-0 bottom-0 left-0 z-[6] flex flex-col border-r"
      style={{ width: SHELF_WIDTH }}
    >
      <div className="flex shrink-0 flex-col gap-2 px-3 pt-3 pb-2">
        <label className="bg-surface border-line-1 focus-within:border-accent flex h-8 items-center gap-2 rounded-[8px] border px-2.5">
          <Search className="text-ink-3 size-[14px] shrink-0" strokeWidth={1.75} />
          <input
            value={keyword}
            onChange={event => setKeyword(event.target.value)}
            placeholder="搜索卡片、文章、文档、PDF、日记"
            aria-label="搜索素材"
            className="text-ink-1 placeholder:text-ink-3 min-w-0 flex-1 bg-transparent text-[13px] outline-none"
          />
        </label>
        <div className="flex flex-wrap gap-1">
          {[null, ...INSERTABLE_KINDS].map(k => (
            <button
              key={k ?? "all"}
              type="button"
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
              className={cn(
                "h-6 rounded-[6px] px-2 text-[12px]",
                kind === k
                  ? "bg-accent-soft text-accent-text"
                  : "text-ink-3 hover:bg-hover hover:text-ink-1"
              )}
            >
              {k ? ENTITY_KIND_META[k].label : "全部"}
            </button>
          ))}
        </div>
      </div>
      <div
        ref={setListEl}
        role="listbox"
        aria-multiselectable
        className="edge-fade-scroll min-h-0 flex-1 overflow-y-auto px-1.5 pb-2"
      >
        {search.isPending ? (
          <Loading />
        ) : groups.length === 0 ? (
          <p className="text-ink-3 py-8 text-center text-[12.5px]">
            {debounced ? `没有找到「${debounced}」` : "还没有可以放入的内容"}
          </p>
        ) : (
          groups.map(group => (
            <div key={group.name}>
              <div className="text-ink-3 truncate px-2 pt-2.5 pb-1 text-[11.5px]">{group.name}</div>
              {group.options.map(option => (
                <Row
                  key={option.key}
                  option={option}
                  placed={placed.has(option.key)}
                  picked={picked.has(option.key)}
                  onPick={() => togglePick(option)}
                  onLocate={() => locate(option)}
                  onDragStart={event => dragStart(option, event)}
                />
              ))}
            </div>
          ))
        )}
      </div>
      <div className="border-line-1 text-ink-3 shrink-0 border-t px-3 py-2 text-[11.5px]">
        {picked.size
          ? `已选 ${picked.size} 篇，拖动任意一篇一起放入`
          : "拖到画布上放置 · ⌘ 点选多篇"}
      </div>
      {/* 成叠拖入的拖拽影子：离屏渲染，setDragImage 截取 */}
      <div ref={stackRef} className="pointer-events-none fixed top-[-200px] left-[-400px]">
        <div className="bg-surface border-line-1 shadow-card text-ink-1 relative rounded-[8px] border px-3 py-2 text-[13px]">
          {dragCount || picked.size} 篇
          <span className="border-line-1 bg-surface absolute inset-0 -z-10 translate-x-1 translate-y-1 rounded-[8px] border" />
        </div>
      </div>
    </aside>
  );
}

/** 画布层：宿主允许（白板页面）且开关打开时显示；只读画布不显示 */
export function MaterialShelfLayer() {
  const board = useBoard();
  const open = useWhiteboardShelfStore(state => state.open);
  const { shelf } = useDocumentHost();
  if (!shelf || !open || board.readonly) return null;
  return <Shelf />;
}
