import { useEffect, useRef, useState, useContext } from "react";
import { X } from "lucide-react";
import { useDrag, useDrop, type DropTargetMonitor } from "react-dnd";
import { useReadOnly } from "slate-react";

import { If } from "@tau/shared";
import type { ITabItem } from "../../types";
import { TAB_REORDER_TYPE, TabsDragScopeContext } from "../../context";

interface IDragItem {
  tabKey: string;
  scope: object | null;
}

interface TabTitleProps {
  tab: ITabItem;
  index: number;
  activeKey: string;
  dropBefore: boolean;
  dropAfter: boolean;
  onHoverDrop: (hint: { index: number; before: boolean } | null) => void;
  onReorder: (fromKey: string, toIndex: number, before: boolean) => void;
  onClickTab: (key: string) => void;
  onDeleteTab: (key: string) => void;
  onTitleChange: (key: string, title: string) => void;
}

const MAX_TITLE_LENGTH = 100;

const TabTitle = (props: TabTitleProps) => {
  const {
    tab,
    index,
    activeKey,
    dropBefore,
    dropAfter,
    onHoverDrop,
    onReorder,
    onClickTab,
    onDeleteTab,
    onTitleChange,
  } = props;

  const readOnly = useReadOnly();
  const scope = useContext(TabsDragScopeContext);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const tabRef = useRef<HTMLDivElement>(null);
  const dropBeforeRef = useRef(true);

  const isActive = tab.key === activeKey;

  const [{ isDragging }, dragRef] = useDrag(
    {
      type: TAB_REORDER_TYPE,
      canDrag: () => !readOnly && !editing,
      item: { tabKey: tab.key, scope },
      end: () => onHoverDrop(null),
      collect: monitor => ({ isDragging: monitor.isDragging() }),
    },
    [readOnly, editing, tab.key, scope, onHoverDrop]
  );

  const [, dropRef] = useDrop<IDragItem, void>(
    {
      accept: TAB_REORDER_TYPE,
      canDrop: item =>
        !readOnly && scope !== null && item.scope === scope && item.tabKey !== tab.key,
      hover: (item: IDragItem, monitor: DropTargetMonitor) => {
        if (item.tabKey === tab.key || !monitor.canDrop()) return;
        const client = monitor.getClientOffset();
        const node = tabRef.current;
        if (!client || !node) return;
        const rect = node.getBoundingClientRect();
        const before = client.x < rect.left + rect.width / 2;
        dropBeforeRef.current = before;
        onHoverDrop({ index, before });
      },
      drop: (item: IDragItem) => {
        if (readOnly || scope === null || item.scope !== scope) return;
        onReorder(item.tabKey, index, dropBeforeRef.current);
      },
    },
    [index, tab.key, scope, readOnly, onHoverDrop, onReorder]
  );

  const attachRef = (node: HTMLDivElement | null) => {
    tabRef.current = node;
    dragRef(node);
    dropRef(node);
  };

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const beginRename = () => {
    if (readOnly || editing) return;
    setDraft(tab.title);
    setEditing(true);
  };

  const commitRename = () => {
    if (!editing) return;
    setEditing(false);
    const title = draft.trim().slice(0, MAX_TITLE_LENGTH);
    if (title && title !== tab.title) {
      onTitleChange(tab.key, title);
    }
  };

  // 中键关闭 Tab，与浏览器标签页习惯一致
  const handleAuxClick = (event: React.MouseEvent) => {
    if (readOnly || event.button !== 1) return;
    event.preventDefault();
    onDeleteTab(tab.key);
  };

  // editing 时必须覆盖掉继承的 user-select:none，否则 input 获得焦点也不显示光标
  const containerClass = `group/tab relative flex h-7 shrink-0 ${
    editing ? "select-text" : "cursor-pointer select-none"
  } items-center gap-1 rounded-md px-3 text-[13px] leading-none transition-all duration-200 ${
    isActive || editing
      ? "bg-white font-medium text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-50"
      : "text-zinc-500 hover:text-[var(--ed-text)] dark:hover:text-zinc-100"
  } ${isDragging ? "opacity-40" : ""}`;

  if (editing) {
    return (
      <div data-tab-key={tab.key} className={containerClass}>
        {/* 隐形容器：不可见的镜像文本（尾部多留一格）撑宽，input 铺满其上，实现无跳变的原地编辑 */}
        <span className="relative inline-flex min-w-[1.5ch]">
          <span className="invisible whitespace-pre" aria-hidden>
            {draft + " "}
          </span>
          <input
            ref={inputRef}
            value={draft}
            maxLength={MAX_TITLE_LENGTH}
            onChange={event => setDraft(event.target.value)}
            onBlur={commitRename}
            onClick={event => event.stopPropagation()}
            onDoubleClick={event => event.stopPropagation()}
            onKeyDown={event => {
              event.stopPropagation();
              if (event.key === "Enter" && !event.nativeEvent.isComposing) commitRename();
              if (event.key === "Escape") setEditing(false);
            }}
            className="absolute inset-0 h-full w-full border-0 bg-transparent p-0 caret-current outline-none"
            style={{ font: "inherit", color: "inherit" }}
          />
        </span>
      </div>
    );
  }

  return (
    <div
      ref={attachRef}
      data-tab-key={tab.key}
      role="tab"
      aria-selected={isActive}
      title={readOnly ? tab.title : "双击或按 Enter 重命名，可拖动调整顺序"}
      onClick={event => {
        event.preventDefault();
        event.stopPropagation();
        onClickTab(tab.key);
      }}
      onDoubleClick={event => {
        event.stopPropagation();
        beginRename();
      }}
      onKeyDown={event => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          beginRename();
        }
      }}
      onAuxClick={handleAuxClick}
      className={containerClass}
    >
      {dropBefore && (
        <div className="absolute -left-1 top-1/2 z-10 h-4 w-0.5 -translate-y-1/2 rounded-full bg-[var(--ed-accent,#71717a)]" />
      )}
      {dropAfter && (
        <div className="absolute -right-1 top-1/2 z-10 h-4 w-0.5 -translate-y-1/2 rounded-full bg-[var(--ed-accent,#71717a)]" />
      )}
      <span className="max-w-[12em] truncate">{tab.title || "标签"}</span>
      {/* 删除按钮常驻显示（占位固定、无浮现与布局动画），仅 hover 变红作删除提示 */}
      <If condition={!readOnly}>
        <button
          aria-label="删除标签"
          title="删除标签（可用撤销恢复）"
          onClick={event => {
            event.preventDefault();
            event.stopPropagation();
            onDeleteTab(tab.key);
          }}
          className="flex h-[15px] w-[15px] shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 text-zinc-400/70 transition-colors hover:bg-red-500/10 hover:text-red-500 dark:text-zinc-500/70 dark:hover:bg-red-500/15 dark:hover:text-red-400"
        >
          <X size={11} />
        </button>
      </If>
    </div>
  );
};

export default TabTitle;
