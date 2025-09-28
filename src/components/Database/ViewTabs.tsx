import { memo, useEffect, useMemo, useRef, useState } from "react";
import classNames from "classnames";
import {
  MdAdd,
  MdClose,
  MdOutlineGroupWork,
  MdSort,
  MdOutlineFilterAlt,
} from "react-icons/md";
import { useMemoizedFn } from "ahooks";
import { useDrag, useDrop } from "react-dnd";
import EditText, { EditTextHandle } from "@/components/EditText";
import { DataTableView } from "@/types";
import { useDatabaseStore } from "./hooks";
import { Popover, Tooltip } from "antd";
import GroupPanel from "./GroupPanel";
import SortPanel from "./SortPanel";
import PluginManager from "./PluginManager";
import FilterPanel from "./FilterPanel";

interface DragItem {
  type: "view-tab";
  id: number;
}

interface ViewTabsProps {
  pluginManager: PluginManager;
  onCreateView?: () => void;
  onDeleteView?: (viewId: number) => Promise<void>;
  onActiveViewIdChange?: (viewId: number) => Promise<void>;
  onRenameView?: (viewId: number, name: string) => Promise<void>;
  onReorderViews?: (orderedIds: number[]) => Promise<void> | void;
  theme: "light" | "dark";
}

interface ViewTabItemProps {
  view: DataTableView;
  index: number;
  isActive: boolean;
  isEditing: boolean;
  allowDelete: boolean;
  getOrderedIds: () => number[];
  onActivate: (viewId: number) => void;
  onStartEdit: (viewId: number, currentName: string) => void;
  onDelete?: (viewId: number) => void;
  onCommit: (viewId: number, value: string, fallback: string) => void;
  onReorder?: (orderedIds: number[]) => void;
}

const ViewTabItem: React.FC<ViewTabItemProps> = memo(
  ({
    view,
    index,
    isActive,
    isEditing,
    allowDelete,
    getOrderedIds,
    onActivate,
    onStartEdit,
    onDelete,
    onCommit,
    onReorder,
  }) => {
    const editRef = useRef<EditTextHandle | null>(null);

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
        collect: (monitor) => ({
          isDragging: monitor.isDragging(),
        }),
      }),
      [view.id],
    );

    const [, drop] = useDrop<DragItem>(
      () => ({
        accept: "view-tab",
        hover: (item) => {
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
      [getOrderedIds, onReorder, view.id, index],
    );

    const setContainerRef = (node: HTMLDivElement | null) => {
      if (!node) return;
      drag(drop(node));
    };

    const commitChange = () => {
      const value = editRef.current?.getValue() ?? view.name;
      onCommit(view.id, value, view.name);
    };

    return (
      <div
        ref={setContainerRef}
        style={{ opacity: isDragging ? 0.6 : 1 }}
        className={classNames(
          "inline-flex items-center gap-1 px-3 h-9 rounded-full transition-colors cursor-pointer",
          {
            "bg-[#F0EFED] text-[#2C2C2C] dark:bg-[#30302E] dark:text-[#FFFFFF]":
              isActive,
            "text-[#807D78] hover:bg-[#F0EFED] dark:hover:bg-[#30302E] dark:text-[#A5A199]":
              !isActive,
          },
        )}
        onClick={() => onActivate(view.id)}
        onDoubleClick={(event) => {
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
          className={classNames(
            "truncate h-9 flex items-center max-w-[140px] text-sm px-0 outline-none cursor-pointer",
            { "select-none cursor-default": !isEditing },
          )}
          onBlur={commitChange}
          onPressEnter={commitChange}
        />
        {allowDelete && (
          <div className="h-9 flex items-center justify-center">
            <MdClose
              className="text-base flex-none"
              onClick={(event) => {
                event.stopPropagation();
                onDelete?.(view.id);
              }}
            />
          </div>
        )}
      </div>
    );
  },
);

ViewTabItem.displayName = "ViewTabItem";

const ViewTabs: React.FC<ViewTabsProps> = memo(
  ({
    pluginManager,
    onCreateView,
    onDeleteView,
    onActiveViewIdChange,
    onRenameView,
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
    } = useDatabaseStore((state) => ({
      activeViewId: state.activeViewId,
      views: state.views,
      viewConfig: state.viewConfig,
      setGroupBy: state.setGroupBy,
      columns: state.columns,
      setSorts: state.setSorts,
      setFilters: state.setFilters,
    }));
    const [showGrouping, setShowGrouping] = useState(false);
    const [showSorting, setShowSorting] = useState(false);
    const [showFilter, setShowFilter] = useState(false);

    const orderedIds = useMemo(() => views.map((view) => view.id), [views]);
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
      if (!onActiveViewIdChange) return;
      onActiveViewIdChange(viewId);
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

    const handleCommit = useMemoizedFn(
      async (viewId: number, value: string, fallback: string) => {
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
      },
    );

    const handleReorder = useMemoizedFn((nextOrderedIds: number[]) => {
      if (!onReorderViews) return;
      const serialized = JSON.stringify(nextOrderedIds);
      if (serialized === previousOrderRef.current) return;
      previousOrderRef.current = serialized;
      orderedIdsRef.current = nextOrderedIds;
      onReorderViews(nextOrderedIds);
    });

    return (
      <div className="flex items-center gap-2 pb-2">
        <div className="flex items-center gap-2 overflow-x-auto">
          {views.map((view, index) => (
            <ViewTabItem
              key={view.id}
              view={view}
              index={index}
              isActive={view.id === activeViewId}
              isEditing={editingId === view.id}
              allowDelete={views.length > 1}
              getOrderedIds={() => orderedIdsRef.current}
              onActivate={handleActivate}
              onStartEdit={handleStartEdit}
              onDelete={onDeleteView ? handleDelete : undefined}
              onCommit={handleCommit}
              onReorder={onReorderViews ? handleReorder : undefined}
            />
          ))}
          <div
            className="flex w-9 h-9 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 cursor-pointer"
            onClick={() => onCreateView?.()}
          >
            <div className="h-9 flex items-center justify-center">
              <Tooltip title="新视图">
                <MdAdd />
              </Tooltip>
            </div>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Popover
            open={showFilter}
            onOpenChange={(visible) => setShowFilter(visible)}
            trigger="click"
            placement="bottom"
            content={
              <FilterPanel
                columns={columns}
                filters={viewConfig.filters ?? null}
                pluginManager={pluginManager}
                onChange={(nextFilters) => setFilters(nextFilters)}
                onClose={() => setShowFilter(false)}
                theme={theme}
              />
            }
          >
            <div
              className={classNames(
                "flex h-9 items-center ml-auto gap-1 px-3 rounded-full hover:bg-[#F0EFED] text-[#2C2C2C] dark:hover:bg-[#30302E] dark:text-[#FFFFFF] cursor-pointer",
                {
                  "bg-[#F0EFED] dark:bg-[#30302E]": Boolean(viewConfig.filters),
                },
              )}
            >
              <Tooltip title="筛选设置">
                <div className="h-9 flex items-center justify-center">
                  <MdOutlineFilterAlt />
                </div>
              </Tooltip>
            </div>
          </Popover>
          <Popover
            open={showSorting}
            onOpenChange={(visible) => setShowSorting(visible)}
            trigger="click"
            placement="bottom"
            content={
              <SortPanel
                pluginManager={pluginManager}
                columns={columns}
                sorts={viewConfig.sorts ?? []}
                onChange={(nextSorts) => setSorts(nextSorts)}
                onClose={() => setShowSorting(false)}
              />
            }
          >
            <div
              className={classNames(
                "flex h-9 items-center ml-auto gap-1 px-3 rounded-full hover:bg-[#F0EFED] text-[#2C2C2C] dark:hover:bg-[#30302E] dark:text-[#FFFFFF] cursor-pointer",
                {
                  "bg-[#F0EFED] dark:bg-[#30302E]":
                    viewConfig.sorts?.length > 0,
                },
              )}
            >
              <Tooltip title="排序设置">
                <div className="h-9 flex items-center justify-center">
                  <MdSort />
                </div>
              </Tooltip>
            </div>
          </Popover>
          <Popover
            open={showGrouping}
            onOpenChange={(visible) => setShowGrouping(visible)}
            trigger="click"
            placement="bottom"
            content={
              <GroupPanel
                pluginManager={pluginManager}
                columns={columns}
                config={viewConfig.groupBy ?? null}
                onClose={() => setShowGrouping(false)}
                onSubmit={(groupBy) => setGroupBy(groupBy)}
              />
            }
          >
            <div
              className={classNames(
                "flex h-9 items-center ml-auto gap-1 px-3 rounded-full hover:bg-[#F0EFED] text-[#2C2C2C] dark:hover:bg-[#30302E] dark:text-[#FFFFFF] cursor-pointer",
                {
                  "bg-[#F0EFED] dark:bg-[#30302E]": viewConfig.groupBy !== null,
                },
              )}
            >
              <Tooltip title="分组设置">
                <div className="h-9 flex items-center justify-center">
                  <MdOutlineGroupWork />
                </div>
              </Tooltip>
            </div>
          </Popover>
        </div>
      </div>
    );
  },
);

ViewTabs.displayName = "ViewTabs";

export default ViewTabs;
