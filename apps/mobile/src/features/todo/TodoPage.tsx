import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  Eye,
  FolderPlus,
  GitBranch,
  ListFilter,
  ListTodo,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { PageHeader, PageHeaderButton } from "../../components/PageHeader";
import type { MoveAndReorderTodoItemPayload, TodoGroup, TodoItem, TodoItemType } from "../../types";
import { SELECTABLE_TODO_TYPES } from "../../types";
import { useEdgeFade } from "../../hooks/useScrollState";
import { toggleTodoComplete } from "./toggleComplete";
import { getTodoItemsCacheKey, useTodoStore } from "./store/useTodoStore";
import {
  useTodoGroupStats,
  useTodoGroups,
  useTodoItemsByCacheKey,
  useTodoSystemGroups,
} from "./queries";
import { TodoItemTree } from "./components/TodoItemTree";
import { BottomSheet } from "../../components/BottomSheet";
import { MobileConfirmDialog } from "../../components/MobileConfirmDialog";
import { clampText } from "../../utils/richTextText";
import { ActionSheet } from "../../components/ActionSheet";
import type { ActionSheetItem } from "../../components/ActionSheet";

type TodoPageProps = {
  onBack: () => void;
  onOpenDetail: (todoId: number, groupId?: number) => void;
  onError: (error: unknown, fallback: string) => void;
  databaseName?: string | null;
  isVisible?: boolean;
  /** 从 FAB「新任务」进入时自动弹出创建面板 */
  autoOpenCreate?: boolean;
};

const TYPE_LABELS: Record<TodoItemType, string> = {
  normal: "普通",
  deadline: "截止",
  planned: "计划",
  recurring: "周期",
};

// 系统分组展示名：systemType → 业务语义（后端 title 仅作兜底）
const SYSTEM_GROUP_LABELS: Record<Exclude<TodoGroup["systemType"], null>, string> = {
  all: "全部任务",
  normal: "普通任务",
  deadline: "截止任务",
  recurring: "周期任务",
};

const SYSTEM_GROUP_ORDER: Exclude<TodoGroup["systemType"], null>[] = [
  "all",
  "normal",
  "deadline",
  "recurring",
];

function applyFilters(
  items: TodoItem[],
  filters: {
    completed?: boolean;
    overdue?: boolean;
    keyword?: string;
    type?: TodoItemType | "all";
  }
) {
  const now = Date.now();
  const keyword = (filters.keyword ?? "").trim().toLowerCase();
  return items.filter(item => {
    if (filters.completed != null && item.isCompleted !== filters.completed) {
      return false;
    }
    if (filters.overdue && (item.isCompleted || item.dueAt == null || item.dueAt >= now)) {
      return false;
    }
    if (filters.type && filters.type !== "all" && item.type !== filters.type) {
      return false;
    }
    if (keyword && !item.title.toLowerCase().includes(keyword)) {
      return false;
    }
    return true;
  });
}

export function TodoPage({
  onBack,
  onOpenDetail,
  onError,
  databaseName,
  isVisible = true,
  autoOpenCreate = false,
}: TodoPageProps) {
  const store = useTodoStore();
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState<TodoItemType>("normal");
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [createItemSheetOpen, setCreateItemSheetOpen] = useState(false);
  const createItemInputRef = useRef<HTMLInputElement>(null);

  // Group sheet
  const [groupSheetOpen, setGroupSheetOpen] = useState(false);
  const [newGroupTitle, setNewGroupTitle] = useState("");
  const groupInputRef = useRef<HTMLInputElement>(null);

  // Type ActionSheet (for new item sheet)
  const [typeSheetOpen, setTypeSheetOpen] = useState(false);

  // Item ActionSheet
  const [actionItem, setActionItem] = useState<TodoItem | null>(null);
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TodoItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Sub-task / insert BottomSheet
  const [subSheetOpen, setSubSheetOpen] = useState(false);
  const [subSheetTitle, setSubSheetTitle] = useState("");
  const [subSheetMode, setSubSheetMode] = useState<"child" | "above" | "below">("child");
  const subInputRef = useRef<HTMLInputElement>(null);

  // Search bar
  const [searchBarOpen, setSearchBarOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listScrollRef = useRef<HTMLDivElement>(null);
  useEdgeFade(listScrollRef);

  // A2 工具行：分组选择 / 筛选 Sheet
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  const groupsQuery = useTodoGroups();
  const systemGroupsQuery = useTodoSystemGroups();
  const statsQuery = useTodoGroupStats();
  const groups = groupsQuery.data ?? [];
  const systemGroups = systemGroupsQuery.data ?? [];
  const allGroups = useMemo(() => [...systemGroups, ...groups], [systemGroups, groups]);
  const customGroups = groups;
  const activeItemsKey = getTodoItemsCacheKey(store.activeGroupId, systemGroups);
  const itemsQuery = useTodoItemsByCacheKey(activeItemsKey, systemGroups);
  // data 未就绪时保持稳定空数组引用，避免下游 memo（TodoItemTree 的树扁平化）反复重算
  const emptyItems = useMemo<TodoItem[]>(() => [], []);
  const activeItems = itemsQuery.data ?? emptyItems;
  const filteredItems = useMemo(
    () => applyFilters(activeItems, store.filters),
    [activeItems, store.filters]
  );
  const dragSortEnabled =
    !store.filters.keyword &&
    store.filters.completed === undefined &&
    store.filters.overdue === undefined &&
    (store.filters.type ?? "all") === "all";

  useEffect(() => {
    // 依赖必须是稳定的 action 引用（store.initialize）而非整个 store 对象——
    // zustand 每次 set() 都产生新的 store 引用，依赖整体会导致 initialize 无限重跑
    void store.initialize(databaseName);
  }, [databaseName, store.initialize]);

  useEffect(() => {
    if (groupSheetOpen) {
      setTimeout(() => groupInputRef.current?.focus(), 100);
    }
  }, [groupSheetOpen]);

  useEffect(() => {
    if (createItemSheetOpen) {
      setTimeout(() => createItemInputRef.current?.focus(), 100);
    }
  }, [createItemSheetOpen]);

  useEffect(() => {
    if (subSheetOpen) {
      setTimeout(() => subInputRef.current?.focus(), 100);
    }
  }, [subSheetOpen]);

  useEffect(() => {
    if (searchBarOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [searchBarOpen]);

  const handleCreateGroup = async () => {
    const title = newGroupTitle.trim();
    if (!title) return;
    setCreatingGroup(true);
    try {
      await store.createGroup({ title });
      await store.reloadAfterDatabaseChange(databaseName ?? null);
      setNewGroupTitle("");
      setGroupSheetOpen(false);
    } catch (error) {
      onError(error, "创建任务分组失败");
    } finally {
      setCreatingGroup(false);
    }
  };

  const handleCreateItem = async () => {
    const title = newTitle.trim();
    if (!title) return;
    const activeGroup = allGroups.find(group => group.id === store.activeGroupId);
    const targetGroupId = activeGroup?.isSystem ? (groups[0]?.id ?? null) : store.activeGroupId;
    if (targetGroupId == null) {
      onError(new Error("TODO_GROUP_NOT_FOUND: no writable group"), "请先创建一个任务分组");
      return;
    }
    try {
      const item = await store.createItem({
        groupId: targetGroupId,
        title,
        type: newType,
      });
      setNewTitle("");
      setCreateItemSheetOpen(false);
      onOpenDetail(item.id, item.groupId);
    } catch (error) {
      onError(error, "创建任务失败");
    }
  };

  const handleToggleComplete = async (item: TodoItem, isCompleted: boolean) => {
    await toggleTodoComplete(item, isCompleted, onError);
  };

  const handleOpenActions = (item: TodoItem) => {
    setActionItem(item);
    setActionSheetOpen(true);
  };

  const handleCreateRelative = async () => {
    if (!actionItem) return;
    const title = subSheetTitle.trim();
    if (!title) return;
    try {
      await store.createItemRelative({
        refId: actionItem.id,
        position: subSheetMode,
        title,
        type: actionItem.type,
      });
      setSubSheetTitle("");
      setSubSheetOpen(false);
    } catch (error) {
      onError(error, "任务操作失败");
    }
  };

  const handleDeleteItem = async (item: TodoItem) => {
    if (deleteLoading) return;
    setDeleteLoading(true);
    try {
      // 统一走级联删除：叶子节点等价普通删除，有子任务时避免产生孤儿节点
      await store.deleteItemCascade(item.id);
      setDeleteTarget(null);
    } catch (error) {
      onError(error, "删除任务失败");
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleMoveAndReorder = async (payload: MoveAndReorderTodoItemPayload) => {
    try {
      await store.moveAndReorder(payload);
    } catch (error) {
      onError(error, "调整任务顺序失败");
      throw error;
    }
  };

  const actionSheetItems: ActionSheetItem[] = actionItem
    ? [
        {
          label: "查看详情",
          icon: <Eye size={18} />,
          tone: "sky",
          onClick: () => {
            onOpenDetail(actionItem.id, actionItem.groupId);
          },
        },
        {
          label: "新增子任务",
          icon: <GitBranch size={18} />,
          tone: "sage",
          onClick: () => {
            setSubSheetMode("child");
            setSubSheetTitle("");
            setSubSheetOpen(true);
          },
        },
        {
          label: "在上方插入",
          icon: <ArrowUp size={18} />,
          tone: "apricot",
          onClick: () => {
            setSubSheetMode("above");
            setSubSheetTitle("");
            setSubSheetOpen(true);
          },
        },
        {
          label: "在下方插入",
          icon: <ArrowDown size={18} />,
          tone: "apricot",
          onClick: () => {
            setSubSheetMode("below");
            setSubSheetTitle("");
            setSubSheetOpen(true);
          },
        },
        {
          label: "删除任务",
          danger: true,
          icon: <Trash2 size={18} />,
          onClick: () => {
            setDeleteTarget(actionItem);
          },
        },
      ]
    : [];

  // Plus ActionSheet
  const [plusSheetOpen, setPlusSheetOpen] = useState(false);

  // FAB「新任务」入口：进入即弹出创建面板（仅首挂载消费一次）
  useEffect(() => {
    if (autoOpenCreate) {
      setPlusSheetOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const plusSheetItems: ActionSheetItem[] = [
    {
      label: "新建任务",
      icon: <ListTodo size={18} />,
      tone: "sage",
      onClick: () => {
        setNewTitle("");
        setNewType("normal");
        setCreateItemSheetOpen(true);
      },
    },
    {
      label: "新建分组",
      icon: <FolderPlus size={18} />,
      tone: "butter",
      onClick: () => {
        setNewGroupTitle("");
        setGroupSheetOpen(true);
      },
    },
  ];

  // ── A2 工具行派生数据 ──
  const statsMap = statsQuery.data ?? {};
  const orderedSystemGroups = useMemo(() => {
    const order = new Map<string, number>(SYSTEM_GROUP_ORDER.map((type, index) => [type, index]));
    return [...systemGroups].sort(
      (a, b) => (order.get(a.systemType ?? "") ?? 999) - (order.get(b.systemType ?? "") ?? 999)
    );
  }, [systemGroups]);
  const activeGroup = allGroups.find(group => group.id === store.activeGroupId) ?? null;
  const activeGroupStats = activeGroup ? statsMap[activeGroup.id] : undefined;
  const stateFilterActive = store.filters.completed !== undefined || store.filters.overdue === true;
  const scopeCountLabel = store.filters.keyword
    ? `${filteredItems.length} 项结果`
    : `${activeGroupStats?.uncompleted ?? 0} 项待办`;

  const renderGroupRow = (group: TodoGroup) => {
    const isActive = store.activeGroupId === group.id;
    const stats = statsMap[group.id];
    const parts = [`${stats?.total ?? 0} 项`];
    if (stats && stats.uncompleted > 0) parts.push(`未完成 ${stats.uncompleted}`);
    if (stats && stats.overdue > 0) parts.push(`逾期 ${stats.overdue}`);
    const label = group.systemType
      ? (SYSTEM_GROUP_LABELS[group.systemType] ?? group.title)
      : group.title;
    return (
      <button
        key={group.id}
        type="button"
        onClick={() => {
          store.setActiveGroup(group.id);
          setGroupPickerOpen(false);
        }}
        className="border-line flex w-full items-center gap-2.5 border-b border-dashed py-3 text-left last:border-b-0"
      >
        <span
          className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border-2 transition-colors ${
            isActive ? "border-accent bg-accent" : "border-line"
          }`}
        >
          {isActive ? <Check size={10} strokeWidth={3.5} className="text-white" /> : null}
        </span>
        <span
          className={`truncate text-[13.5px] font-bold ${isActive ? "text-accent" : "text-ink"}`}
        >
          {label}
        </span>
        <span className="text-ink-3 ml-auto shrink-0 text-[11.5px] tabular-nums">
          {parts.join(" · ")}
        </span>
      </button>
    );
  };

  const filterOptions: Array<{
    label: string;
    active: boolean;
    onClick: () => void;
  }> = [
    {
      label: "全部",
      active: store.filters.completed === undefined && !store.filters.overdue,
      onClick: () => store.setFilters({ completed: undefined, overdue: undefined }),
    },
    {
      label: "未完成",
      active: store.filters.completed === false && !store.filters.overdue,
      onClick: () => store.setFilters({ completed: false, overdue: undefined }),
    },
    {
      label: "逾期",
      active: store.filters.overdue === true,
      onClick: () => store.setFilters({ overdue: true, completed: undefined }),
    },
  ];

  return (
    <div className="mobile-kb-screen bg-page fixed inset-0 z-50 flex flex-col">
      {searchBarOpen ? (
        <PageHeader>
          <div className="bg-input flex flex-1 items-center gap-2 rounded-full px-3">
            <Search size={15} className="text-ink-3 shrink-0" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchInput}
              onChange={e => {
                setSearchInput(e.target.value);
                store.setFilters({
                  keyword: e.target.value.trim() || undefined,
                });
              }}
              placeholder="搜索任务"
              className="text-ink placeholder:text-ink-3 h-9 flex-1 bg-transparent text-sm outline-none"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput("");
                  store.setFilters({ keyword: undefined });
                }}
                className="text-ink-3 shrink-0"
              >
                <X size={15} />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setSearchBarOpen(false);
              setSearchInput("");
              store.setFilters({ keyword: undefined });
            }}
            className="text-accent ml-2 shrink-0 text-sm font-semibold"
          >
            取消
          </button>
        </PageHeader>
      ) : (
        <PageHeader
          title="任务中心"
          onBack={onBack}
          actions={
            <>
              <PageHeaderButton
                icon={<Search size={17} strokeWidth={2} />}
                aria-label="搜索"
                onClick={() => {
                  setSearchInput(store.filters.keyword ?? "");
                  setSearchBarOpen(true);
                }}
              />
              <PageHeaderButton
                icon={<Plus size={18} strokeWidth={2.6} />}
                variant="brand"
                aria-label="新建"
                onClick={() => setPlusSheetOpen(true)}
              />
            </>
          }
        />
      )}

      {/* A2 工具行：分组入口 + 筛选入口 + 当前范围待办数。
          统计大卡/分组 Tabs/双行筛选卡全部收纳进两个 Sheet，列表高度最大化 */}
      <div className="flex items-center gap-2 px-4 pb-2.5 pt-1">
        <button
          type="button"
          onClick={() => setGroupPickerOpen(true)}
          className="border-line bg-surface shadow-card flex min-w-0 shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 transition-transform active:scale-[0.97]"
        >
          <span className="text-ink max-w-[7em] truncate text-[13px] font-extrabold">
            {activeGroup?.title ?? "任务"}
          </span>
          {activeGroupStats && activeGroupStats.uncompleted > 0 ? (
            <span className="bg-input text-ink-3 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums leading-none">
              {activeGroupStats.uncompleted}
            </span>
          ) : null}
          <ChevronDown size={14} className="text-ink-3 shrink-0" />
        </button>
        <button
          type="button"
          onClick={() => setFilterSheetOpen(true)}
          className="border-line bg-surface text-ink-2 shadow-card relative flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-[12.5px] font-extrabold transition-transform active:scale-[0.97]"
        >
          <ListFilter size={14} />
          筛选
          {stateFilterActive ? (
            <span className="border-page bg-accent absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2" />
          ) : null}
        </button>
        <span className="text-ink-3 ml-auto min-w-0 shrink-0 text-[11.5px] font-bold tabular-nums">
          {scopeCountLabel}
        </span>
      </div>

      {/* 二级页无吸底 Dock，底部只留常规呼吸空间（同项目/知识库列表）：
          留白挂外层容器，滚动容器自身不带 padding，内容不会顶到安全区 */}
      <div
        className="flex min-h-0 flex-1 flex-col overscroll-contain"
        style={{ paddingBottom: "var(--page-bottom-inset)" }}
      >
        <div ref={listScrollRef} className="edge-fade-scroll flex-1 overflow-y-auto">
          {itemsQuery.isLoading ? (
            <div className="text-ink-3 px-4 py-8 text-center text-sm">正在加载任务...</div>
          ) : (
            <TodoItemTree
              items={filteredItems}
              allItems={activeItems}
              scrollContainerRef={listScrollRef}
              isVisible={isVisible}
              onOpenDetail={item => {
                onOpenDetail(item.id, item.groupId);
              }}
              onToggleComplete={(item, isCompleted) => {
                void handleToggleComplete(item, isCompleted);
              }}
              onOpenActions={item => {
                handleOpenActions(item);
              }}
              onMoveAndReorder={handleMoveAndReorder}
              enableDragSort={dragSortEnabled}
            />
          )}
        </div>
      </div>

      {/* 新增分组 Sheet */}
      <BottomSheet open={groupSheetOpen} title="新增分组" onClose={() => setGroupSheetOpen(false)}>
        <input
          ref={groupInputRef}
          type="text"
          value={newGroupTitle}
          onChange={e => setNewGroupTitle(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter") void handleCreateGroup();
          }}
          placeholder="请输入分组名称"
          className="input-base h-11 w-full px-4 text-[14px]"
        />
        <button
          type="button"
          onClick={() => void handleCreateGroup()}
          disabled={creatingGroup || !newGroupTitle.trim()}
          className="shadow-accent mt-3 h-11 w-full rounded-full text-sm font-bold text-white active:scale-[0.98] disabled:opacity-50"
        >
          创建
        </button>
      </BottomSheet>

      {/* 分组选择 Sheet（A2）：系统分组（含类型维度）+ 自定义分组，行内带统计 */}
      <BottomSheet
        open={groupPickerOpen}
        title="选择分组"
        onClose={() => setGroupPickerOpen(false)}
      >
        <div className="text-ink-3 mb-1 text-[11.5px] font-extrabold">系统分组</div>
        {orderedSystemGroups.map(renderGroupRow)}
        <div className="text-ink-3 mb-1 mt-4 text-[11.5px] font-extrabold">自定义分组</div>
        {customGroups.length > 0 ? (
          customGroups.map(renderGroupRow)
        ) : (
          <div className="text-ink-3 py-3 text-[12.5px]">还没有自定义分组</div>
        )}
      </BottomSheet>

      {/* 筛选 Sheet（A2）：状态筛选（类型维度并入系统分组，不再单独暴露） */}
      <BottomSheet open={filterSheetOpen} title="筛选" onClose={() => setFilterSheetOpen(false)}>
        <div className="text-ink-3 mb-2.5 text-[11.5px] font-extrabold">状态</div>
        <div className="flex gap-2">
          {filterOptions.map(opt => (
            <button
              key={opt.label}
              type="button"
              onClick={() => {
                opt.onClick();
                setFilterSheetOpen(false);
              }}
              className={`flex-1 rounded-full px-3 py-2.5 text-xs font-bold transition-all active:scale-95 ${
                opt.active ? "bg-accent shadow-accent text-white" : "bg-input text-ink-3"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </BottomSheet>

      {/* 新增子任务 / 插入 Sheet */}
      <BottomSheet
        open={subSheetOpen}
        title={
          subSheetMode === "child"
            ? "新增子任务"
            : subSheetMode === "above"
              ? "在上方插入"
              : "在下方插入"
        }
        onClose={() => setSubSheetOpen(false)}
      >
        <input
          ref={subInputRef}
          type="text"
          value={subSheetTitle}
          onChange={e => setSubSheetTitle(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter") void handleCreateRelative();
          }}
          placeholder="请输入任务标题"
          className="input-base h-11 w-full px-4 text-[14px]"
        />
        <button
          type="button"
          onClick={() => void handleCreateRelative()}
          disabled={!subSheetTitle.trim()}
          className="shadow-accent mt-3 h-11 w-full rounded-full text-sm font-bold text-white active:scale-[0.98] disabled:opacity-50"
        >
          创建
        </button>
      </BottomSheet>

      {/* 新建任务 Sheet */}
      <BottomSheet
        open={createItemSheetOpen}
        title="新建任务"
        onClose={() => setCreateItemSheetOpen(false)}
      >
        <input
          ref={createItemInputRef}
          type="text"
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter") void handleCreateItem();
          }}
          placeholder="请输入任务标题"
          className="input-base h-11 w-full px-4 text-[14px]"
        />
        <button
          type="button"
          onClick={() => setTypeSheetOpen(true)}
          className="input-base mt-3 flex w-full items-center justify-between px-4 py-3.5"
        >
          <span className="text-ink-2 text-sm">类型</span>
          <span className="text-ink text-sm font-bold">{TYPE_LABELS[newType]}</span>
        </button>
        <button
          type="button"
          onClick={() => void handleCreateItem()}
          disabled={!newTitle.trim()}
          className="shadow-accent mt-3 h-11 w-full rounded-full text-sm font-bold text-white active:scale-[0.98] disabled:opacity-50"
        >
          创建
        </button>
      </BottomSheet>

      {/* 类型选择 ActionSheet */}
      <ActionSheet
        open={typeSheetOpen}
        title="选择任务类型"
        items={SELECTABLE_TODO_TYPES.map(t => ({
          label: TYPE_LABELS[t],
          trailing: newType === t ? <Check strokeWidth={2.6} /> : undefined,
          onClick: () => setNewType(t),
        }))}
        onClose={() => setTypeSheetOpen(false)}
      />

      {/* + ActionSheet */}
      <ActionSheet
        open={plusSheetOpen}
        items={plusSheetItems}
        onClose={() => setPlusSheetOpen(false)}
      />

      {/* 任务操作 ActionSheet */}
      <ActionSheet
        open={actionSheetOpen}
        title={actionItem?.title}
        kind="任务"
        items={actionSheetItems}
        onClose={() => setActionSheetOpen(false)}
      />

      <MobileConfirmDialog
        open={deleteTarget !== null}
        title="删除任务"
        description={
          deleteTarget && activeItems.some(i => i.parentId === deleteTarget.id)
            ? `「${clampText(deleteTarget.title, 18)}」及其全部子任务将被删除。`
            : `「${clampText(deleteTarget?.title ?? "", 18)}」将被删除。`
        }
        danger
        loading={deleteLoading}
        onCancel={() => {
          if (deleteLoading) return;
          setDeleteTarget(null);
        }}
        onConfirm={() => {
          if (deleteTarget) void handleDeleteItem(deleteTarget);
        }}
      />
    </div>
  );
}

export default TodoPage;
