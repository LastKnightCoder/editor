import { memo, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownUp, Filter, Layers, MoreHorizontal, Plus, Search } from "lucide-react";
import { useMemoizedFn } from "ahooks";
import { useDrag, useDrop } from "react-dnd";
import { cn } from "@tau/ui/cn";
import { Input } from "@tau/ui/Input";
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
          "group/tab inline-flex h-7 cursor-pointer items-center gap-0.5 rounded-full pl-3 pr-1.5",
          "ease-tau-out transition-colors duration-[160ms]",
          isActive
            ? "bg-selected text-ink-1 font-medium"
            : "text-ink-2 hover:bg-hover hover:text-ink-1"
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
              className="text-ink-3 hover:bg-press hover:text-ink-1 grid size-[22px] place-items-center rounded-[7px] opacity-0 transition-opacity focus-visible:opacity-100 group-hover/tab:opacity-100"
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

/** 工具栏圆形切换钮：激活 = bg-selected，悬停 = 淡墨 */
const ToolbarToggle = ({
  active,
  label,
  icon: Icon,
  onClick,
  buttonRef,
}: {
  active: boolean;
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
        "ease-tau-out grid size-7 place-items-center rounded-full transition-colors duration-[160ms]",
        active ? "bg-selected text-ink-1" : "text-ink-2 hover:bg-hover hover:text-ink-1"
      )}
    >
      <Icon className="size-4" strokeWidth={1.75} />
    </button>
  </Tooltip>
);

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

    const filterButtonRef = useRef<HTMLButtonElement>(null);
    const sortButtonRef = useRef<HTMLButtonElement>(null);
    const groupButtonRef = useRef<HTMLButtonElement>(null);

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
              className="text-ink-3 hover:bg-hover hover:text-ink-1 ease-tau-out grid size-7 place-items-center rounded-full transition-colors duration-[160ms]"
              onClick={() => setShowViewTypeSelect(true)}
            >
              <Plus className="size-4" strokeWidth={1.75} />
            </button>
          </Tooltip>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Input
            size="sm"
            lead={Search}
            clearable
            value={searchKeyword}
            onChange={e => setQuery({ text: e.target.value })}
            placeholder="搜索..."
            className="w-[150px]"
          />
          <ToolbarToggle
            active={Boolean(viewConfig.filters)}
            label="筛选设置"
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
          <ToolbarToggle
            active={(viewConfig.sorts?.length ?? 0) > 0}
            label="排序设置"
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
          <ToolbarToggle
            active={viewConfig.groupBy !== null}
            label="分组设置"
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
