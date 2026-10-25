import { useLayoutEffect } from "react";
import { bindTextFieldTextarea } from "@tau/editor/api";
import type { EditorTextField } from "@tau/editor/text-field-contract";
/**
 * 白板详情页签条：浮在画布纸面左下角，与右下状态栏同一套画布 chrome 语言（D-049：实底 surface +
 * shadow-lift + 1px 细描边，激活 = accent-soft，组间靠留白不画竖线），一左一右融在同一张纸里。
 * 「所有页」→ 各页签 → 「＋ 新建页」（同浏览器，新页落在末尾）；只有一页时只留「＋ 新建页」。
 * 点击切页，双击改名，右键重命名 / 复制 / 删除，拖动排序；页多时页签横向滚动，当前页自动滚进可视范围。
 */

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useDrag, useDrop } from "react-dnd";
import { Check, Copy, Files, PencilLine, Plus, Trash2 } from "lucide-react";
import { ContextMenu, Menu, cn } from "@tau/ui";
import { ChromeButton, ChromeGap } from "@tau/whiteboard";

const DND_TYPE = "WHITEBOARD_PAGE_TAB";

export interface SheetBarPage {
  id: number;
  name: string;
}

export interface SheetBarProps {
  pages: SheetBarPage[];
  activeId: number;
  className?: string;
  style?: CSSProperties;
  onSelect(id: number): void;
  onAdd(): void;
  onRename(id: number, name: string): void;
  textBinding?(id: number): EditorTextField;
  onDuplicate(id: number): void;
  onDelete(id: number): void;
  onReorder(ids: number[]): void;
}

export function SheetBar(props: SheetBarProps) {
  const { pages, activeId } = props;
  const [order, setOrder] = useState(pages);
  const [editing, setEditing] = useState<number | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  // 拖拽结束时读最新顺序（end 回调可能来自拖拽开始那次渲染）
  const orderRef = useRef(order);
  orderRef.current = order;
  useEffect(() => setOrder(pages), [pages]);

  // 当前页签滚进可视范围（页多、切页或新建后）
  useEffect(() => {
    scrollRef.current
      ?.querySelector<HTMLElement>(`[data-page-id="${activeId}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeId, pages.length]);

  const move = (from: number, to: number) =>
    setOrder(prev => {
      if (from === to || from < 0 || to < 0 || from >= prev.length || to >= prev.length)
        return prev;
      const next = prev.slice();
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  const commitOrder = () => {
    const ids = orderRef.current.map(p => p.id);
    if (ids.some((id, i) => id !== pages[i]?.id)) props.onReorder(ids);
  };

  const barClass = cn(
    "bg-surface shadow-lift ring-line-2 flex min-w-0 items-center gap-0.5 rounded-[12px] p-1 ring-1",
    props.className
  );

  // 只有一页：「页」的概念先不出现，只留一个带字的新建入口；有第二页起才展开成页签条
  if (pages.length <= 1)
    return (
      <div style={props.style} className={barClass}>
        <button
          type="button"
          onClick={props.onAdd}
          className="text-ink-2 hover:bg-hover hover:text-ink-1 ease-tau-out inline-flex h-[30px] items-center gap-1.5 rounded-[8px] pr-2.5 pl-2 text-[12.5px] transition-[background-color,color] duration-150"
        >
          <Plus className="size-4" strokeWidth={1.75} />
          新建页
        </button>
      </div>
    );

  return (
    <div style={props.style} className={barClass}>
      <Menu
        open={listOpen}
        onOpenChange={setListOpen}
        className="max-h-[360px]"
        trigger={
          <ChromeButton label="所有页" tooltipPlacement="top">
            <Files strokeWidth={1.75} />
          </ChromeButton>
        }
      >
        {pages.map((p, i) => (
          <Menu.Item
            key={p.id}
            onSelect={() => props.onSelect(p.id)}
            icon={
              p.id === activeId ? (
                <Check className="text-accent-text size-[15px]" strokeWidth={1.75} />
              ) : (
                <span className="font-tau-mono text-ink-3 w-[15px] text-center text-[11px]">
                  {i + 1}
                </span>
              )
            }
          >
            {p.name || "未命名"}
          </Menu.Item>
        ))}
      </Menu>
      <ChromeGap />
      <div
        ref={scrollRef}
        role="tablist"
        aria-label="白板页"
        className="flex min-w-0 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {order.map((p, index) => (
          <PageTab
            key={p.id}
            page={p}
            index={index}
            active={p.id === activeId}
            editing={editing === p.id}
            textBinding={props.textBinding ? () => props.textBinding!(p.id) : undefined}
            canDelete={pages.length > 1}
            onSelect={() => props.onSelect(p.id)}
            onStartRename={() => setEditing(p.id)}
            onRename={name => {
              setEditing(null);
              const next = name.trim();
              if (!props.textBinding && next && next !== p.name) props.onRename(p.id, next);
            }}
            onCancelRename={() => setEditing(null)}
            onDuplicate={() => props.onDuplicate(p.id)}
            onDelete={() => props.onDelete(p.id)}
            onMove={move}
            onDragEnd={commitOrder}
          />
        ))}
      </div>
      <ChromeGap />
      <ChromeButton label="新建页" tooltipPlacement="top" onClick={props.onAdd}>
        <Plus strokeWidth={1.75} />
      </ChromeButton>
    </div>
  );
}

function PageTab({
  page,
  index,
  active,
  editing,
  textBinding,
  canDelete,
  onSelect,
  onStartRename,
  onRename,
  onCancelRename,
  onDuplicate,
  onDelete,
  onMove,
  onDragEnd,
}: {
  page: SheetBarPage;
  index: number;
  active: boolean;
  editing: boolean;
  textBinding?(): EditorTextField;
  canDelete: boolean;
  onSelect(): void;
  onStartRename(): void;
  onRename(name: string): void;
  onCancelRename(): void;
  onDuplicate(): void;
  onDelete(): void;
  onMove(from: number, to: number): void;
  onDragEnd(): void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [{ dragging }, drag] = useDrag({
    type: DND_TYPE,
    item: { index },
    canDrag: !editing,
    collect: monitor => ({ dragging: monitor.isDragging() }),
    end: onDragEnd,
  });
  const [, drop] = useDrop<{ index: number }>({
    accept: DND_TYPE,
    hover: (item, monitor) => {
      const el = ref.current;
      const offset = monitor.getClientOffset();
      if (!el || !offset || item.index === index) return;
      const rect = el.getBoundingClientRect();
      const middle = rect.left + rect.width / 2;
      // 越过目标中线才换位，避免来回抖
      if (item.index < index && offset.x < middle) return;
      if (item.index > index && offset.x > middle) return;
      onMove(item.index, index);
      item.index = index;
    },
  });
  drag(drop(ref));

  const menu: ReactNode = (
    <>
      <Menu.Item
        icon={<PencilLine className="size-[15px]" strokeWidth={1.75} />}
        onSelect={onStartRename}
      >
        重命名
      </Menu.Item>
      <Menu.Item icon={<Copy className="size-[15px]" strokeWidth={1.75} />} onSelect={onDuplicate}>
        复制这一页
      </Menu.Item>
      <Menu.Separator />
      <Menu.Item
        danger
        disabled={!canDelete}
        icon={<Trash2 className="size-[15px]" strokeWidth={1.75} />}
        onSelect={onDelete}
      >
        删除这一页
      </Menu.Item>
    </>
  );

  return (
    <ContextMenu content={menu}>
      <div
        ref={ref}
        role="tab"
        tabIndex={0}
        aria-selected={active}
        data-page-id={page.id}
        title={editing ? undefined : "双击改名，右键更多，拖动排序"}
        onClick={() => !editing && onSelect()}
        onDoubleClick={onStartRename}
        onKeyDown={e => {
          if (editing) return;
          if (e.key === "Enter") onSelect();
          if (e.key === "F2") onStartRename();
        }}
        className={cn(
          "ease-tau-out flex h-[30px] max-w-[180px] flex-none cursor-default select-none items-center whitespace-nowrap rounded-[8px] text-[12.5px] transition-[background-color,color] duration-150",
          // 改名时页签让位给输入框：不叠底色与内边距，输入框占满页签原位
          editing
            ? "px-0"
            : active
              ? "bg-accent-soft text-accent-text px-3 font-medium"
              : "text-ink-2 hover:bg-hover hover:text-ink-1 px-3",
          dragging && "opacity-40"
        )}
      >
        {editing ? (
          <RenameInput
            initial={page.name}
            textBinding={textBinding}
            onDone={onRename}
            onCancel={onCancelRename}
          />
        ) : (
          <span className="truncate">{page.name || "未命名"}</span>
        )}
      </div>
    </ContextMenu>
  );
}

function RenameInput({
  initial,
  textBinding,
  onDone,
  onCancel,
}: {
  initial: string;
  textBinding?(): EditorTextField;
  onDone(name: string): void;
  onCancel(): void;
}) {
  const [value, setValue] = useState(initial);
  const input = useRef<HTMLInputElement>(null),
    getBinding = useRef(textBinding);
  const [error, setError] = useState("");
  useLayoutEffect(() => {
    if (!getBinding.current || !input.current) return;
    const handle = getBinding.current(),
      bound = bindTextFieldTextarea(input.current, handle, setValue, setError);
    return () => {
      bound.dispose();
      handle.dispose();
    };
  }, []);
  const done = useRef(false);
  const finish = (ok: boolean) => {
    if (done.current || error) return;
    done.current = true;
    if (ok) onDone(value);
    else onCancel();
  };
  return (
    <input
      autoFocus
      ref={input}
      title={error || undefined}
      aria-invalid={!!error}
      readOnly={!!error}
      value={textBinding ? undefined : value}
      onFocus={e => e.currentTarget.select()}
      onChange={textBinding ? undefined : e => setValue(e.target.value)}
      onBlur={() => finish(true)}
      onClick={e => e.stopPropagation()}
      onDoubleClick={e => e.stopPropagation()}
      onKeyDown={e => {
        // 不让画布快捷键（删除元素等）收到按键
        e.stopPropagation();
        if (e.nativeEvent.isComposing) return;
        if (e.key === "Enter") finish(true);
        if (e.key === "Escape") finish(false);
      }}
      className="bg-surface border-accent text-ink-1 h-[30px] w-[140px] rounded-[8px] border px-[11px] text-[12.5px] font-normal outline-none"
    />
  );
}
