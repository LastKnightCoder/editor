/**
 * 白板详情底部页签栏（XMind 式，mockups/whiteboard-detail/plan-a2-xmind.html 定稿，D-048）：
 * 左侧「＋ 新建页」「所有页」，接着是各页签；当前页签与上方画布纸面同色、从纸面下缘垂下。
 * 点击切页，双击改名，右键重命名 / 复制 / 删除，拖动排序。
 *
 * autoHide：只有一页时默认隐藏，鼠标移到底边才浮出（XMind 同款）；改名 / 菜单打开期间保持显示。
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useDrag, useDrop } from "react-dnd";
import { Check, Copy, Files, PencilLine, Plus, Trash2 } from "lucide-react";
import { ContextMenu, IconButton, Menu, cn } from "@tau/ui";

const DND_TYPE = "WHITEBOARD_PAGE_TAB";

export interface SheetBarPage {
  id: number;
  name: string;
}

export interface SheetBarProps {
  pages: SheetBarPage[];
  activeId: number;
  autoHide?: boolean;
  onSelect(id: number): void;
  onAdd(): void;
  onRename(id: number, name: string): void;
  onDuplicate(id: number): void;
  onDelete(id: number): void;
  onReorder(ids: number[]): void;
}

export function SheetBar(props: SheetBarProps) {
  const { pages, activeId, autoHide } = props;
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

  const busy = editing !== null || listOpen;

  return (
    <div
      className={cn(
        "flex h-[34px] min-w-0 flex-none items-start",
        autoHide &&
          "ease-tau-out bg-page pointer-events-none absolute bottom-0 left-3.5 z-[3] max-w-[calc(100%-28px)] rounded-tr-[12px] pr-1.5 opacity-0 transition-opacity duration-150 hover:pointer-events-auto hover:opacity-100 peer-hover:pointer-events-auto peer-hover:opacity-100",
        autoHide && busy && "pointer-events-auto opacity-100"
      )}
    >
      <div className="flex h-[30px] flex-none items-center gap-0.5 pl-0.5 pr-1.5">
        <IconButton title="新建页" className="size-7 rounded-[8px]" onClick={props.onAdd}>
          <Plus className="size-[15px]" strokeWidth={1.75} />
        </IconButton>
        <Menu
          open={listOpen}
          onOpenChange={setListOpen}
          className="max-h-[360px]"
          trigger={
            <IconButton title="所有页" className="size-7 rounded-[8px]">
              <Files className="size-[15px]" strokeWidth={1.75} />
            </IconButton>
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
        <span aria-hidden className="bg-line-1 ml-1 h-4 w-px" />
      </div>
      <div
        ref={scrollRef}
        role="tablist"
        aria-label="白板页"
        className="flex min-w-0 items-start overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {order.map((p, index) => (
          <PageTab
            key={p.id}
            page={p}
            index={index}
            active={p.id === activeId}
            editing={editing === p.id}
            canDelete={pages.length > 1}
            onSelect={() => props.onSelect(p.id)}
            onStartRename={() => setEditing(p.id)}
            onRename={name => {
              setEditing(null);
              const next = name.trim();
              if (next && next !== p.name) props.onRename(p.id, next);
            }}
            onCancelRename={() => setEditing(null)}
            onDuplicate={() => props.onDuplicate(p.id)}
            onDelete={() => props.onDelete(p.id)}
            onMove={move}
            onDragEnd={commitOrder}
          />
        ))}
      </div>
    </div>
  );
}

function PageTab({
  page,
  index,
  active,
  editing,
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
          "text-tau-meta ease-tau-out relative flex h-[30px] max-w-[200px] flex-none cursor-default select-none items-center whitespace-nowrap rounded-b-[10px] px-3.5 transition-[background,color] duration-150",
          active
            ? "bg-surface text-ink-1 shadow-card z-[1] font-medium"
            : "text-ink-2 hover:bg-hover hover:text-ink-1",
          dragging && "opacity-40"
        )}
      >
        {editing ? (
          <RenameInput initial={page.name} onDone={onRename} onCancel={onCancelRename} />
        ) : (
          <span className="truncate">{page.name || "未命名"}</span>
        )}
        {active && (
          <span
            aria-hidden
            className="bg-accent absolute bottom-[5px] left-3 right-3 h-[2px] rounded-full"
          />
        )}
      </div>
    </ContextMenu>
  );
}

function RenameInput({
  initial,
  onDone,
  onCancel,
}: {
  initial: string;
  onDone(name: string): void;
  onCancel(): void;
}) {
  const [value, setValue] = useState(initial);
  const done = useRef(false);
  const finish = (ok: boolean) => {
    if (done.current) return;
    done.current = true;
    if (ok) onDone(value);
    else onCancel();
  };
  return (
    <input
      autoFocus
      value={value}
      onFocus={e => e.currentTarget.select()}
      onChange={e => setValue(e.target.value)}
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
      className="bg-surface border-accent text-tau-meta text-ink-1 h-6 w-[120px] rounded-[6px] border px-1.5 font-normal shadow-[var(--tau-focus-ring)] outline-none"
    />
  );
}
