/**
 * 放入面板：响应白板的放入请求（`/`、工具栏「文档」、右键「文档」、从文档卡拖到空白处），贴着落点打开检索。
 * - 空输入分两组：「和选中相关」（选中或拖出的那张文档卡的连接、反链与语义相近内容）与「最近编辑」；
 * - ↑↓ 移动、↵ 放入当前行、⌘↵ 勾选多篇（勾选后 ↵ 一起放入）、Tab 切换类型、Esc 关闭；
 * - 放下的位置就是落点；拖出的请求放入后自动连回来源卡。
 * 根节点带 CANVAS_OVERLAY_ATTR：面板里的按键、指针不归画布。
 */

import { materialNoteText, useDocumentInsertI18n } from "../../insert.i18n";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useDebounce, useMemoizedFn } from "ahooks";
import { Check, Search } from "lucide-react";
import { cn, Loading, useEdgeFade } from "@tau/ui";
import {
  CANVAS_OVERLAY_ATTR,
  DOCUMENT_INSERT_EVENT,
  useBoard,
  type DocumentElement,
  type DocumentInsertRequest,
} from "@tau/whiteboard";
import { searchEntities } from "@/commands";
import { EntityKindIcon } from "@/components/EntityKind/EntityKindIcon";
import { ENTITY_KIND_META } from "@/components/EntityPicker/meta";
import { DesktopEditorOverlayDismiss } from "@/services/editorOverlayDismiss";
import type { EntityKind } from "@/types";
import {
  INSERTABLE_KINDS,
  insertDocuments,
  placedKeys,
  toMaterialOption,
  type MaterialOption,
  type MaterialGroup,
} from "./insert";
import { useRelated } from "./related";

const PANEL_WIDTH = 380;
const PANEL_HEIGHT = 420;
const MARGIN = 12;

type Option = MaterialOption;

type KindFilter = EntityKind | null;
const KIND_ORDER: KindFilter[] = [null, ...INSERTABLE_KINDS];

function Panel({ request, onClose }: { request: DocumentInsertRequest; onClose(): void }) {
  const context = useDocumentInsertI18n();
  const { t } = context;
  const board = useBoard();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [keyword, setKeyword] = useState("");
  const debounced = useDebounce(keyword, { wait: 150 });
  const [kind, setKind] = useState<KindFilter>(null);
  const [active, setActive] = useState(0);
  const [picked, setPicked] = useState<Map<string, Option>>(() => new Map());
  const [saving, setSaving] = useState(false);
  const [listEl, setListEl] = useState<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  useEdgeFade(listEl);
  const now = useRef(Date.now()).current;
  const placed = useMemo(() => placedKeys(board), [board]);

  const near = useMemo(() => {
    const id =
      request.linkFrom ??
      (board.selection.selectedElements.length === 1
        ? board.selection.selectedElements[0].id
        : undefined);
    const element = id ? board.getElement(id) : undefined;
    return element?.type === "document" ? (element as DocumentElement) : null;
  }, [board, request.linkFrom]);

  const search = useQuery({
    queryKey: ["whiteboard-insert-search", kind ?? INSERTABLE_KINDS, debounced],
    queryFn: () =>
      searchEntities({ kind: kind ?? INSERTABLE_KINDS, keyword: debounced, limit: 30 }),
    staleTime: 10_000,
    placeholderData: keepPreviousData,
  });
  const related = useRelated(near);

  const groups = useMemo<MaterialGroup[]>(() => {
    const matchesKind = (option: Option) => !kind || option.kind === kind;
    const results = (search.data ?? [])
      .map(candidate => toMaterialOption(candidate, now))
      .filter((option): option is Option => option !== null);
    if (debounced.trim()) return [{ id: "search", options: results }];
    const relatedOptions = (related.data ?? [])
      .map((item): Option => ({
        entityRef: item.entityRef,
        title: item.title,
        key: item.key,
        kind: item.kind,
        note: { kind: "related", reasonKind: item.reasonKind },
      }))
      .filter(matchesKind);
    const relatedKeys = new Set(relatedOptions.map(option => option.key));
    return [
      ...(relatedOptions.length && near
        ? [{ id: "related" as const, title: near.title, options: relatedOptions }]
        : []),
      { id: "recent" as const, options: results.filter(option => !relatedKeys.has(option.key)) },
    ].filter(group => group.options.length > 0);
  }, [search.data, related.data, debounced, kind, near, now]);
  const flat = useMemo(() => groups.flatMap(group => group.options), [groups]);

  useEffect(() => setActive(0), [debounced, kind]);
  useEffect(() => {
    listEl?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, listEl]);

  // 贴着落点打开，放不下时往回收；没有屏幕落点（工具栏）就放在画布中央
  useLayoutEffect(() => {
    const layer = rootRef.current?.offsetParent?.getBoundingClientRect();
    if (!layer) return;
    const anchor = request.screen
      ? { x: request.screen.x - layer.left + 10, y: request.screen.y - layer.top + 10 }
      : {
          x: (layer.width - PANEL_WIDTH) / 2,
          y: Math.max(MARGIN, layer.height / 2 - PANEL_HEIGHT / 2),
        };
    setPosition({
      left: Math.max(MARGIN, Math.min(anchor.x, layer.width - PANEL_WIDTH - MARGIN)),
      top: Math.max(MARGIN, Math.min(anchor.y, layer.height - PANEL_HEIGHT - MARGIN)),
    });
  }, [request.screen]);

  useLayoutEffect(() => {
    if (position) inputRef.current?.focus();
  }, [position]);

  // 点到面板外关闭（画布接着处理这次按下）
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [onClose]);

  const commit = useMemoizedFn(async (options: Option[]) => {
    if (!options.length || saving) return;
    setSaving(true);
    try {
      await insertDocuments(
        board,
        options.map(({ entityRef, title }) => ({ entityRef, title })),
        request
      );
      onClose();
    } catch {
      // 失败提示已给出，面板保持打开以便重试
      setSaving(false);
    }
  });

  const toggle = (option: Option) =>
    setPicked(previous => {
      const next = new Map(previous);
      if (next.has(option.key)) next.delete(option.key);
      else next.set(option.key, option);
      return next;
    });

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.nativeEvent.isComposing) return;
    const current = flat[active];
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp":
        event.preventDefault();
        if (flat.length)
          setActive(i => (i + (event.key === "ArrowDown" ? 1 : flat.length - 1)) % flat.length);
        break;
      case "Enter":
        event.preventDefault();
        if (event.metaKey || event.ctrlKey) {
          if (current) toggle(current);
        } else if (picked.size) void commit([...picked.values()]);
        else if (current) void commit([current]);
        break;
      case "Tab": {
        event.preventDefault();
        const step = event.shiftKey ? KIND_ORDER.length - 1 : 1;
        setKind(k => KIND_ORDER[(KIND_ORDER.indexOf(k) + step) % KIND_ORDER.length]);
        break;
      }
    }
  };

  let index = 0;
  return (
    <div
      ref={rootRef}
      {...{ [CANVAS_OVERLAY_ATTR]: "" }}
      role="dialog"
      aria-label={t("insert.title")}
      className={cn(
        "bg-surface border-line-1 shadow-float rounded-tau-lg pointer-events-auto absolute z-[9] flex flex-col border",
        "animate-quick-insert-in origin-top-left motion-reduce:animate-fadeIn",
        !position && "invisible"
      )}
      style={{ width: PANEL_WIDTH, maxHeight: PANEL_HEIGHT, ...position }}
      onKeyDown={onKeyDown}
    >
      <DesktopEditorOverlayDismiss open onDismiss={onClose} />
      <div className="border-line-1 flex h-[42px] shrink-0 items-center gap-2 border-b px-3">
        <Search className="text-ink-3 size-[15px] shrink-0" strokeWidth={1.75} />
        <input
          ref={inputRef}
          value={keyword}
          onChange={event => setKeyword(event.target.value)}
          placeholder={request.linkFrom ? t("insert.linkPlaceholder") : t("insert.placeholder")}
          aria-label={t("insert.searchLabel")}
          className="text-ink-1 placeholder:text-ink-3 min-w-0 flex-1 bg-transparent text-[14px] outline-none"
        />
        <div className="flex shrink-0 gap-0.5">
          {INSERTABLE_KINDS.map(k => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => {
                setKind(current => (current === k ? null : k));
                inputRef.current?.focus();
              }}
              className={cn(
                "h-[22px] rounded-[6px] px-1.5 text-[11.5px]",
                kind === k
                  ? "bg-accent-soft text-accent-text"
                  : "text-ink-3 hover:bg-hover hover:text-ink-1"
              )}
            >
              {ENTITY_KIND_META[k].label}
            </button>
          ))}
        </div>
      </div>
      <div
        ref={setListEl}
        role="listbox"
        aria-multiselectable
        className="edge-fade-scroll min-h-0 flex-1 overflow-y-auto p-1"
      >
        {search.isPending ? (
          <Loading />
        ) : flat.length === 0 ? (
          <p className="text-ink-3 py-8 text-center text-[12.5px]">
            {debounced ? t("empty.search", { keyword: debounced }) : t("empty")}
          </p>
        ) : (
          groups.map(group => (
            <div key={group.id}>
              <div className="text-ink-3 truncate px-2.5 pt-2 pb-1 text-[11.5px]">
                {group.id === "related"
                  ? t("group.related", { title: group.title || t("selectedDocument") })
                  : t(`group.${group.id}`)}
              </div>
              {group.options.map(option => {
                const i = index++;
                const on = picked.has(option.key);
                const onBoard = placed.has(option.key);
                return (
                  <button
                    key={option.key}
                    type="button"
                    role="option"
                    aria-selected={on}
                    data-index={i}
                    tabIndex={-1}
                    onMouseMove={() => i !== active && setActive(i)}
                    onClick={event =>
                      event.metaKey || event.ctrlKey ? toggle(option) : void commit([option])
                    }
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-[7px] text-left outline-none",
                      on ? "bg-selected" : i === active && "bg-hover"
                    )}
                  >
                    <EntityKindIcon
                      entityRef={option.entityRef}
                      fallback={ENTITY_KIND_META[option.kind]}
                      className="text-ink-3 size-[14px] shrink-0"
                      strokeWidth={1.75}
                    />
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate text-[13px]",
                        onBoard ? "text-ink-3" : "text-ink-1"
                      )}
                    >
                      {option.title || t("untitled")}
                    </span>
                    <span className="text-ink-3 shrink-0 text-[11.5px]">
                      {onBoard
                        ? t("onBoard", { note: materialNoteText(option.note, context) })
                        : materialNoteText(option.note, context)}
                    </span>
                    {picked.size > 0 && (
                      <span
                        className={cn(
                          "grid size-4 shrink-0 place-items-center rounded-[5px] border-[1.5px]",
                          on
                            ? "bg-accent border-accent text-ink-inverse"
                            : "border-ink-3 text-transparent"
                        )}
                      >
                        <Check className="size-[11px]" strokeWidth={3} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>
      <div className="border-line-1 text-ink-3 flex shrink-0 gap-3 border-t px-3 py-[7px] text-[11.5px]">
        {picked.size ? (
          <span className="text-ink-2">{t("picked.insert", { count: picked.size })}</span>
        ) : (
          <>
            <span>{t("shortcut.select")}</span>
            <span>{t("shortcut.insert")}</span>
            <span>{t("shortcut.multi")}</span>
            <span>{t("shortcut.kind")}</span>
          </>
        )}
      </div>
    </div>
  );
}

/** 画布层：一次只开一个面板；新请求替换旧的（旧请求的临时连线随之撤掉） */
export function QuickInsertLayer() {
  const board = useBoard();
  const [request, setRequest] = useState<DocumentInsertRequest | null>(null);
  const requestRef = useRef(request);
  requestRef.current = request;

  useEffect(() => {
    const open = (next: DocumentInsertRequest) => {
      if (board.readonly) {
        next.release?.();
        return;
      }
      requestRef.current?.release?.();
      setRequest(next);
    };
    board.on(DOCUMENT_INSERT_EVENT, open);
    return () => {
      board.off(DOCUMENT_INSERT_EVENT, open);
      requestRef.current?.release?.();
    };
  }, [board]);

  const close = useMemoizedFn(() => {
    requestRef.current?.release?.();
    setRequest(null);
  });

  return request ? <Panel key={requestKey(request)} request={request} onClose={close} /> : null;
}

const requestKey = (request: DocumentInsertRequest) =>
  `${request.at.x},${request.at.y},${request.linkFrom ?? ""}`;
