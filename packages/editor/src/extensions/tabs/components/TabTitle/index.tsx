import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useDrag, useDrop, type DropTargetMonitor } from "react-dnd";
import { useReadOnly } from "slate-react";

import { If } from "@tau/shared";
import type { ITabItem } from "../../../types";
import { TAB_REORDER_TYPE } from "../../context";

interface IDragItem {
  tabKey: string;
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
      item: { tabKey: tab.key },
      end: () => onHoverDrop(null),
      collect: monitor => ({ isDragging: monitor.isDragging() }),
    },
    [readOnly, editing]
  );

  const [, dropRef] = useDrop<IDragItem, void>(
    {
      accept: TAB_REORDER_TYPE,
      canDrop: item => item.tabKey !== tab.key,
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
        onReorder(item.tabKey, index, dropBeforeRef.current);
      },
    },
    [index]
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

  // editing 时必须覆盖掉继承的 user-select:none，否则 input 获得焦点也不显示光标。
  // 激活指示是压在头部底线上的 2px 短线（::after），悬停未激活项时以描边色预示
  const containerClass = `group/tab relative flex shrink-0 ${
    editing ? "select-text" : "cursor-pointer select-none"
  } items-center gap-0.5 px-px text-[13.5px] leading-none transition-colors duration-200 after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-t-sm after:transition-colors after:duration-200 after:content-[''] ${
    isActive || editing
      ? "font-medium text-[var(--ed-text)]"
      : "text-[var(--ed-text-secondary)] hover:text-[var(--ed-text)] hover:after:bg-[var(--ed-border)]"
  } ${isActive ? "after:bg-[var(--ed-accent)]" : ""} ${isDragging ? "opacity-40" : ""}`;

  if (editing) {
    return (
      <div data-tab-key={tab.key} className={containerClass}>
        {/* 隐形容器：不可见的镜像文本（尾部多留一格）撑宽，input 铺满其上，实现无跳变的原地编辑 */}
        <span className="relative -mx-[3px] inline-flex min-w-[1.5ch] rounded px-[3px] shadow-[var(--ed-focus-ring)]">
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
              if (event.key === "Enter") commitRename();
              if (event.key === "Escape") setEditing(false);
            }}
            className="absolute inset-y-0 left-[3px] h-full w-[calc(100%-6px)] border-0 bg-transparent p-0 caret-[var(--ed-accent)] outline-none"
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
        <div className="absolute -left-3 top-1/2 z-10 h-4 w-0.5 -translate-y-1/2 rounded-full bg-[var(--ed-accent)]" />
      )}
      {dropAfter && (
        <div className="absolute -right-3 top-1/2 z-10 h-4 w-0.5 -translate-y-1/2 rounded-full bg-[var(--ed-accent)]" />
      )}
      <span className="max-w-[12em] truncate">{tab.title || "标签"}</span>
      {/* 删除按钮占位固定（无布局跳变），仅激活项与悬停项显形；触屏无悬停，只有激活项可点 */}
      <If condition={!readOnly}>
        <button
          aria-label="删除标签"
          title="删除标签（可用撤销恢复）"
          onClick={event => {
            event.preventDefault();
            event.stopPropagation();
            onDeleteTab(tab.key);
          }}
          className={`-mr-1 flex h-[18px] w-[18px] shrink-0 cursor-pointer items-center justify-center rounded-[5px] border-0 bg-transparent p-0 text-[var(--ed-text-tertiary)] transition-[opacity,color,background-color] duration-200 hover:bg-[var(--ed-danger-soft)] hover:text-[var(--ed-danger)] ${
            isActive
              ? "opacity-100"
              : "pointer-events-none opacity-0 group-hover/tab:pointer-events-auto group-hover/tab:opacity-100"
          }`}
        >
          <X size={12} />
        </button>
      </If>
    </div>
  );
};

export default TabTitle;
