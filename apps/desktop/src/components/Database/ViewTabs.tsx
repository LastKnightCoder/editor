import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownUp,
  ChevronDown,
  Filter,
  Layers,
  MoreHorizontal,
  Plus,
  Search,
  X,
} from "lucide-react";
import { useMemoizedFn } from "ahooks";
import { useDrag, useDrop } from "react-dnd";
import { cn } from "@tau/ui/cn";
import { Menu } from "@tau/ui/Menu";
import { Popover } from "@tau/ui/Popover";
import { Tooltip } from "@tau/ui/Tooltip";
import EditText, { EditTextHandle } from "@/components/EditText";
import { DataTableView } from "@/types";
import { useDatabaseStore } from "./hooks";
import GroupPanel from "./GroupPanel";
import SortPanel from "./SortPanel";
import PluginManager from "./PluginManager";
import FilterPanel from "./FilterPanel";
import { countFilterConditions } from "./core/filterTree";
import ViewTypeSelectModal from "./ViewTypeSelectModal";
import ViewEditPanel from "./ViewEditPanel";
import { DataTableViewType } from "@/types";
import type { GalleryViewConfig, CalendarViewConfig, KanbanViewConfig } from "./types";

interface DragItem {
  type: "view-tab";
  id: number;
}

interface ViewTabsProps {
  pluginManager: PluginManager;
  onCreateView?: (
    type: DataTableViewType,
    name: string,
    dateColumnId?: string,
    groupColumnId?: string
  ) => void;
  onDeleteView?: (viewId: number) => Promise<void>;
  onActiveViewIdChange?: (viewId: number) => Promise<void>;
  onRenameView?: (viewId: number, name: string) => Promise<void>;
  onUpdateView?: (
    viewId: number,
    updates: {
      name?: string;
      type?: DataTableViewType;
      galleryConfig?: GalleryViewConfig;
      calendarConfig?: CalendarViewConfig;
      kanbanConfig?: KanbanViewConfig;
    }
  ) => Promise<void>;
  onReorderViews?: (orderedIds: number[]) => Promise<void> | void;
  theme: "light" | "dark";
}

interface ViewTabItemProps {
  view: DataTableView;
  index: number;
  isActive: boolean;
  isEditing: boolean;
  allowDelete: boolean;
  columns: { id: string; title: string; type: string }[];
  getOrderedIds: () => number[];
  onActivate: (viewId: number) => void;
  onStartEdit: (viewId: number, currentName: string) => void;
  onDelete?: (viewId: number) => void;
  onCommit: (viewId: number, value: string, fallback: string) => void;
  onReorder?: (orderedIds: number[]) => void;
  onUpdateView?: (
    viewId: number,
    name: string,
    type: DataTableViewType,
    galleryConfig?: GalleryViewConfig,
    calendarConfig?: CalendarViewConfig,
    kanbanConfig?: KanbanViewConfig
  ) => Promise<void>;
}

const ViewTabItem: React.FC<ViewTabItemProps> = memo(
  ({
    view,
    index,
    isActive,
    isEditing,
    allowDelete,
    columns,
    getOrderedIds,
    onActivate,
    onStartEdit,
    onDelete,
    onCommit,
    onReorder,
    onUpdateView,
  }) => {
    const editRef = useRef<EditTextHandle | null>(null);
    const [showEditPopover, setShowEditPopover] = useState(false);
    const moreButtonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
      if (isEditing) {
        editRef.current?.setContentEditable(true);
        editRef.current?.focusEnd();
      } else {
        editRef.current?.setContentEditable(false);
        editRef.current?.setValue(view.name);
      }
    }, [isEditing, view.name]);

    const [{ isDragging }, drag] = useDrag(
      () => ({
        type: "view-tab",
        item: { type: "view-tab", id: view.id },
        collect: monitor => ({
          isDragging: monitor.isDragging(),
        }),
      }),
      [view.id]
    );

    const [, drop] = useDrop<DragItem>(
      () => ({
        accept: "view-tab",
        hover: item => {
          if (!onReorder || item.id === view.id) return;
          const currentOrder = getOrderedIds();
          const dragIndex = currentOrder.indexOf(item.id);
          if (dragIndex === -1 || dragIndex === index) return;
          const nextIds = [...currentOrder];
          nextIds.splice(dragIndex, 1);
          nextIds.splice(index, 0, item.id);
          onReorder(nextIds);
        },
      }),
      [getOrderedIds, onReorder, view.id, index]
    );

    const setContainerRef = (node: HTMLDivElement | null) => {
      if (!node) return;
      drag(drop(node));
    };

    const commitChange = () => {
      const value = editRef.current?.getValue() ?? view.name;
      onCommit(view.id, value, view.name);
    };

    const handleEditClick = useMemoizedFn(() => {
      setShowEditPopover(true);
    });

    const handleUpdateView = useMemoizedFn(
      async (
        viewId: number,
        name: string,
        type: DataTableViewType,
        galleryConfig?: GalleryViewConfig,
        calendarConfig?: CalendarViewConfig,
        kanbanConfig?: KanbanViewConfig
      ) => {
        await onUpdateView?.(viewId, name, type, galleryConfig, calendarConfig, kanbanConfig);
        setShowEditPopover(false);
      }
    );

    return (
      <div
        ref={setContainerRef}
        style={{ opacity: isDragging ? 0.6 : 1 }}
        className={cn(
          "inline-flex h-7 cursor-pointer items-center gap-0.5 rounded-full pl-3 pr-1.5",
          "ease-tau-out transition-[background-color,opacity] duration-[160ms]",
          isActive
            ? "bg-selected text-ink-1 font-medium"
            : "text-ink-2 opacity-60 hover:opacity-100"
        )}
        onClick={() => onActivate(view.id)}
        onDoubleClick={event => {
          event.stopPropagation();
          if (!isEditing) {
            onStartEdit(view.id, view.name);
          }
        }}
      >
        <EditText
          ref={editRef}
          key={`${view.id}-${view.name}`}
          defaultValue={view.name}
          contentEditable={isEditing}
          className={cn(
            "text-tau-meta flex h-7 max-w-[140px] cursor-pointer items-center truncate px-0 outline-none",
            { "cursor-default select-none": !isEditing }
          )}
          onBlur={commitChange}
          onPressEnter={commitChange}
          isSlateEditor={true}
        />
        <Menu
          trigger={
            <button
              ref={moreButtonRef}
              type="button"
              title="视图操作"
              className="text-ink-2 grid size-[22px] place-items-center rounded-[7px] opacity-60 transition-opacity hover:opacity-100 active:opacity-80 aria-expanded:opacity-100"
              onClick={e => e.stopPropagation()}
            >
              <MoreHorizontal className="size-4" strokeWidth={1.75} />
            </button>
          }
        >
          <Menu.Item onSelect={handleEditClick}>编辑</Menu.Item>
          {allowDelete && (
            <Menu.Item
              danger
              onSelect={() => {
                onDelete?.(view.id);
              }}
            >
              删除
            </Menu.Item>
          )}
        </Menu>
        <Popover
          anchor={moreButtonRef.current}
          open={showEditPopover}
          onOpenChange={setShowEditPopover}
          placement="bottom-end"
          arrow={false}
        >
          <ViewEditPanel
            view={view}
            columns={columns}
            onConfirm={handleUpdateView}
            onClose={() => setShowEditPopover(false)}
          />
        </Popover>
      </div>
    );
  }
);

ViewTabItem.displayName = "ViewTabItem";

/** 工具栏胶囊钮：图标 + 文字 + 激活计数；静止幽灵态（透明度梯度），激活 = bg-selected */
const ToolbarPill = ({
  active,
  count,
  label,
  icon: Icon,
  onClick,
  buttonRef,
}: {
  active: boolean;
  count?: number;
  label: string;
  icon: typeof Filter;
  onClick: () => void;
  buttonRef: React.RefObject<HTMLButtonElement | null>;
}) => (
  <Tooltip content={label}>
    <button
      ref={buttonRef}
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "ease-tau-out flex h-7 items-center gap-1.5 rounded-full px-2.5 transition-[background-color,opacity] duration-[160ms]",
        active
          ? "bg-selected text-ink-1"
          : "text-ink-2 opacity-60 hover:opacity-100 active:opacity-80"
      )}
    >
      <Icon className="size-[13px]" strokeWidth={1.75} />
      <span className="text-tau-meta">{label}</span>
      {active && count ? (
        <span className="text-accent-text text-[10.5px] font-bold tabular-nums">{count}</span>
      ) : null}
      <ChevronDown className="size-[11px] opacity-50" strokeWidth={2.25} />
    </button>
  </Tooltip>
);

/** 搜索：默认只有一个图标钮，点击展开输入框；清空 + 失焦收回，有关键词时保持展开 */
const CollapsibleSearch = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (text: string) => void;
}) => {
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 关键词被外部清空（如切换视图）时收起；输入中清空（焦点仍在）保持展开
  useEffect(() => {
    if (value === "" && document.activeElement !== inputRef.current) setExpanded(false);
  }, [value]);

  if (!expanded) {
    return (
      <Tooltip content="搜索本视图">
        <button
          type="button"
          aria-label="搜索本视图"
          onClick={() => {
            setExpanded(true);
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
          className="text-ink-2 ease-tau-out grid size-7 cursor-pointer place-items-center rounded-full opacity-60 transition-opacity duration-[160ms] hover:opacity-100 active:opacity-80"
        >
          <Search className="size-[15px]" strokeWidth={1.75} />
        </button>
      </Tooltip>
    );
  }

  return (
    <div className="border-line-1 bg-surface flex h-7 w-52 items-center gap-1.5 rounded-full border px-2.5">
      <Search className="text-ink-3 size-[15px] shrink-0" strokeWidth={1.75} />
      <input
        ref={inputRef}
        value={value}
        placeholder="搜索本视图…"
        onChange={e => onChange(e.target.value)}
        onBlur={() => {
          if (value === "") setExpanded(false);
        }}
        onKeyDown={e => {
          if (e.key === "Escape" && !e.nativeEvent.isComposing) {
            if (value !== "") onChange("");
            else setExpanded(false);
            e.stopPropagation();
          }
        }}
        className="text-ink-1 placeholder:text-ink-3 min-w-0 flex-1 bg-transparent text-[12.5px] outline-none"
      />
      {value !== "" && (
        <button
          type="button"
          aria-label="清空搜索"
          onClick={() => {
            onChange("");
            inputRef.current?.focus();
          }}
          className="text-ink-3 hover:bg-hover hover:text-ink-1 grid size-[20px] shrink-0 cursor-pointer place-items-center rounded-[6px]"
        >
          <X className="size-3" strokeWidth={2.2} />
        </button>
      )}
    </div>
  );
};

const ViewTabs: React.FC<ViewTabsProps> = memo(
  ({
    pluginManager,
    onCreateView,
    onDeleteView,
    onActiveViewIdChange,
    onRenameView,
    onUpdateView,
    onReorderViews,
    theme,
  }) => {
    const {
      activeViewId,
      views,
      viewConfig,
      setGroupBy,
      columns,
      setSorts,
      setFilters,
      setActiveViewId,
      searchKeyword,
      setQuery,
    } = useDatabaseStore(state => ({
      activeViewId: state.activeViewId,
      views: state.views,
      viewConfig: state.viewConfig,
      setGroupBy: state.setGroupBy,
      columns: state.columns,
      setSorts: state.setSorts,
      setFilters: state.setFilters,
      setActiveViewId: state.setActiveViewId,
      searchKeyword: state.query.text,
      setQuery: state.setQuery,
    }));
    const [showGrouping, setShowGrouping] = useState(false);
    const [showSorting, setShowSorting] = useState(false);
    const [showFilter, setShowFilter] = useState(false);
    const [showViewTypeSelect, setShowViewTypeSelect] = useState(false);

    // 切换视图时清空搜索词并收起搜索框（不跨视图保留）
    const previousViewIdRef = useRef(activeViewId);
    useEffect(() => {
      if (previousViewIdRef.current !== activeViewId) {
        previousViewIdRef.current = activeViewId;
        if (searchKeyword !== "") setQuery({ text: "" });
      }
    }, [activeViewId, searchKeyword, setQuery]);

    const filterButtonRef = useRef<HTMLButtonElement>(null);
    const sortButtonRef = useRef<HTMLButtonElement>(null);
    const groupButtonRef = useRef<HTMLButtonElement>(null);

    const filterCount = useMemo(
      () => countFilterConditions(viewConfig.filters),
      [viewConfig.filters]
    );
    const sortCount = viewConfig.sorts?.length ?? 0;

    const orderedIds = useMemo(() => views.map(view => view.id), [views]);
    const orderedIdsRef = useRef<number[]>(orderedIds);
    const previousOrderRef = useRef(JSON.stringify(orderedIds));

    useEffect(() => {
      orderedIdsRef.current = orderedIds;
      previousOrderRef.current = JSON.stringify(orderedIds);
    }, [orderedIds]);

    const [editingId, setEditingId] = useState<number | null>(null);

    const stopEditing = useMemoizedFn(() => {
      setEditingId(null);
    });

    const handleActivate = useMemoizedFn((viewId: number) => {
      setActiveViewId(viewId);
      onActiveViewIdChange?.(viewId);
    });

    const handleDelete = useMemoizedFn((viewId: number) => {
      if (!onDeleteView) return;
      if (editingId === viewId) {
        stopEditing();
      }
      onDeleteView(viewId);
    });

    const handleStartEdit = useMemoizedFn((viewId: number) => {
      setEditingId(viewId);
    });

    const handleCommit = useMemoizedFn(async (viewId: number, value: string, fallback: string) => {
      if (editingId !== viewId) return;
      const trimmed = value.trim();
      if (!trimmed) {
        stopEditing();
        return;
      }
      if (!onRenameView) {
        stopEditing();
        return;
      }
      if (trimmed === fallback) {
        stopEditing();
        return;
      }
      try {
        await onRenameView(viewId, trimmed);
        stopEditing();
      } catch (error) {
        console.error("重命名视图失败:", error);
      }
    });

    const handleReorder = useMemoizedFn((nextOrderedIds: number[]) => {
      if (!onReorderViews) return;
      const serialized = JSON.stringify(nextOrderedIds);
      if (serialized === previousOrderRef.current) return;
      previousOrderRef.current = serialized;
      orderedIdsRef.current = nextOrderedIds;
      onReorderViews(nextOrderedIds);
    });

    const handleCreateView = useMemoizedFn(
      (type: DataTableViewType, name: string, dateColumnId?: string, groupColumnId?: string) => {
        onCreateView?.(type, name, dateColumnId, groupColumnId);
        setShowViewTypeSelect(false);
      }
    );

    const handleUpdateView = useMemoizedFn(
      async (
        viewId: number,
        name: string,
        type: DataTableViewType,
        galleryConfig?: GalleryViewConfig,
        calendarConfig?: CalendarViewConfig,
        kanbanConfig?: KanbanViewConfig
      ) => {
        if (!onUpdateView) return;
        await onUpdateView(viewId, {
          name,
          type,
          galleryConfig,
          calendarConfig,
          kanbanConfig,
        });
      }
    );

    return (
      <div className="flex items-center gap-2 pb-2">
        <div className="flex items-center gap-1 overflow-x-auto">
          {views.map((view, index) => (
            <ViewTabItem
              key={view.id}
              view={view}
              index={index}
              isActive={view.id === activeViewId}
              isEditing={editingId === view.id}
              allowDelete={views.length > 1}
              columns={columns}
              getOrderedIds={() => orderedIdsRef.current}
              onActivate={handleActivate}
              onStartEdit={handleStartEdit}
              onDelete={onDeleteView ? handleDelete : undefined}
              onCommit={handleCommit}
              onReorder={onReorderViews ? handleReorder : undefined}
              onUpdateView={handleUpdateView}
            />
          ))}
          <Tooltip content="新视图">
            <button
              type="button"
              className="text-ink-2 ease-tau-out grid size-7 place-items-center rounded-full opacity-60 transition-opacity duration-[160ms] hover:opacity-100 active:opacity-80"
              onClick={() => setShowViewTypeSelect(true)}
            >
              <Plus className="size-4" strokeWidth={1.75} />
            </button>
          </Tooltip>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <CollapsibleSearch value={searchKeyword} onChange={text => setQuery({ text })} />
          <ToolbarPill
            active={filterCount > 0}
            count={filterCount}
            label="筛选"
            icon={Filter}
            buttonRef={filterButtonRef}
            onClick={() => setShowFilter(!showFilter)}
          />
          <Popover
            anchor={filterButtonRef.current}
            open={showFilter}
            onOpenChange={setShowFilter}
            placement="bottom-end"
            arrow={false}
            className="max-w-[420px]"
          >
            <FilterPanel
              columns={columns}
              filters={viewConfig.filters ?? null}
              pluginManager={pluginManager}
              onChange={nextFilters => setFilters(nextFilters)}
              onClose={() => setShowFilter(false)}
              theme={theme}
            />
          </Popover>
          <ToolbarPill
            active={sortCount > 0}
            count={sortCount}
            label="排序"
            icon={ArrowDownUp}
            buttonRef={sortButtonRef}
            onClick={() => setShowSorting(!showSorting)}
          />
          <Popover
            anchor={sortButtonRef.current}
            open={showSorting}
            onOpenChange={setShowSorting}
            placement="bottom-end"
            arrow={false}
          >
            <SortPanel
              pluginManager={pluginManager}
              columns={columns}
              sorts={viewConfig.sorts ?? []}
              onChange={nextSorts => setSorts(nextSorts)}
              onClose={() => setShowSorting(false)}
            />
          </Popover>
          <ToolbarPill
            active={viewConfig.groupBy !== null}
            label="分组"
            icon={Layers}
            buttonRef={groupButtonRef}
            onClick={() => setShowGrouping(!showGrouping)}
          />
          <Popover
            anchor={groupButtonRef.current}
            open={showGrouping}
            onOpenChange={setShowGrouping}
            placement="bottom-end"
            arrow={false}
          >
            <GroupPanel
              pluginManager={pluginManager}
              columns={columns}
              config={viewConfig.groupBy ?? null}
              onClose={() => setShowGrouping(false)}
              onSubmit={groupBy => setGroupBy(groupBy)}
            />
          </Popover>
        </div>
        <ViewTypeSelectModal
          open={showViewTypeSelect}
          onCancel={() => setShowViewTypeSelect(false)}
          onConfirm={handleCreateView}
          columns={columns}
          theme={theme}
        />
      </div>
    );
  }
);

ViewTabs.displayName = "ViewTabs";

export default ViewTabs;
