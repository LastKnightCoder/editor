import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, Plus, Search, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { resolveScreenMotion } from "../../navigation/screenTransition";
import type { PageTransitionConfig } from "../../navigation/types";
import * as tauri from "../../services/tauri";
import type {
  MoveAndReorderTodoItemPayload,
  TodoItem,
  TodoItemType,
} from "../../types";
import { isTodayScheduled, getTodayNormalized } from "./recurrence";
import { getTodoItemsCacheKey, useTodoStore } from "./store/useTodoStore";
import { TodoGroupTabs } from "./components/TodoGroupTabs";
import { TodoItemTree } from "./components/TodoItemTree";
import { BottomSheet } from "../../components/BottomSheet";
import { ActionSheet } from "../../components/ActionSheet";
import type { ActionSheetItem } from "../../components/ActionSheet";

type TodoPageProps = {
  onBack: () => void;
  onOpenDetail: (todoId: number, groupId?: number) => void;
  onError: (error: unknown, fallback: string) => void;
  transition?: PageTransitionConfig;
  databaseName?: string | null;
  isVisible?: boolean;
};

const TYPE_LABELS: Record<TodoItemType, string> = {
  normal: "普通",
  deadline: "截止",
  planned: "计划",
  recurring: "周期",
};

function applyFilters(
  items: TodoItem[],
  filters: {
    completed?: boolean;
    overdue?: boolean;
    keyword?: string;
    type?: TodoItemType | "all";
  },
) {
  const now = Date.now();
  const keyword = (filters.keyword ?? "").trim().toLowerCase();
  return items.filter((item) => {
    if (filters.completed != null && item.isCompleted !== filters.completed) {
      return false;
    }
    if (
      filters.overdue &&
      (item.isCompleted || item.dueAt == null || item.dueAt >= now)
    ) {
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
  transition,
  databaseName,
  isVisible = true,
}: TodoPageProps) {
  const reducedMotion = useReducedMotion();
  const motionProps = resolveScreenMotion(transition, reducedMotion === true);

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

  // Sub-task / insert BottomSheet
  const [subSheetOpen, setSubSheetOpen] = useState(false);
  const [subSheetTitle, setSubSheetTitle] = useState("");
  const [subSheetMode, setSubSheetMode] = useState<"child" | "above" | "below">(
    "child",
  );
  const subInputRef = useRef<HTMLInputElement>(null);

  // Search bar
  const [searchBarOpen, setSearchBarOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listScrollRef = useRef<HTMLDivElement>(null);

  const allGroups = useMemo(
    () => [...store.systemGroups, ...store.groups],
    [store.systemGroups, store.groups],
  );
  const customGroups = store.groups;
  const activeItemsKey = getTodoItemsCacheKey(
    store.activeGroupId,
    store.systemGroups,
  );
  const activeItems = useMemo(() => {
    return activeItemsKey ? (store.itemsByGroupId[activeItemsKey] ?? []) : [];
  }, [activeItemsKey, store.itemsByGroupId]);
  const filteredItems = useMemo(
    () => applyFilters(activeItems, store.filters),
    [activeItems, store.filters],
  );
  const dragSortEnabled =
    !store.filters.keyword &&
    store.filters.completed === undefined &&
    store.filters.overdue === undefined &&
    (store.filters.type ?? "all") === "all";

  useEffect(() => {
    void store.initialize(databaseName);
  }, [databaseName, store]);

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
    const activeGroup = allGroups.find(
      (group) => group.id === store.activeGroupId,
    );
    const targetGroupId = activeGroup?.isSystem
      ? (store.groups[0]?.id ?? null)
      : store.activeGroupId;
    if (targetGroupId == null) {
      onError(
        new Error("TODO_GROUP_NOT_FOUND: no writable group"),
        "请先创建一个任务分组",
      );
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
      store.setActiveTodo(item.id);
      onOpenDetail(item.id, item.groupId);
    } catch (error) {
      onError(error, "创建任务失败");
    }
  };

  const handleToggleComplete = async (item: TodoItem, isCompleted: boolean) => {
    try {
      if (item.type === "recurring") {
        const recurrence =
          item.recurrence ?? (await tauri.todoGetRecurrenceByItem(item.id));
        if (!recurrence)
          throw new Error("TODO_RECURRENCE_NOT_FOUND: recurrence not found");
        if (!isTodayScheduled(recurrence))
          throw new Error("TODO_RECURRENCE_INVALID: today is not scheduled");
        const today = getTodayNormalized();
        if (isCompleted) {
          await tauri.todoCompleteRecurrence(recurrence.id, today);
        } else {
          await tauri.todoUncompleteRecurrence(recurrence.id, today);
        }
        await Promise.all([store.refreshActiveItems(), store.loadGroupStats()]);
        return;
      }
      await store.toggleCompleteCascade({ id: item.id, isCompleted });
    } catch (error) {
      onError(error, "更新任务完成状态失败");
    }
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
    try {
      await store.deleteItem(item.id);
    } catch (error) {
      onError(error, "删除任务失败");
    }
  };

  const handleMoveAndReorder = async (
    payload: MoveAndReorderTodoItemPayload,
  ) => {
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
          onClick: () => {
            onOpenDetail(actionItem.id, actionItem.groupId);
          },
        },
        {
          label: "新增子任务",
          onClick: () => {
            setSubSheetMode("child");
            setSubSheetTitle("");
            setSubSheetOpen(true);
          },
        },
        {
          label: "在上方插入",
          onClick: () => {
            setSubSheetMode("above");
            setSubSheetTitle("");
            setSubSheetOpen(true);
          },
        },
        {
          label: "在下方插入",
          onClick: () => {
            setSubSheetMode("below");
            setSubSheetTitle("");
            setSubSheetOpen(true);
          },
        },
        {
          label: "删除任务",
          danger: true,
          onClick: () => {
            void handleDeleteItem(actionItem);
          },
        },
      ]
    : [];

  // Plus ActionSheet
  const [plusSheetOpen, setPlusSheetOpen] = useState(false);

  const plusSheetItems: ActionSheetItem[] = [
    {
      label: "新建任务",
      onClick: () => {
        setNewTitle("");
        setNewType("normal");
        setCreateItemSheetOpen(true);
      },
    },
    {
      label: "新建分组",
      onClick: () => {
        setNewGroupTitle("");
        setGroupSheetOpen(true);
      },
    },
  ];

  const activeFilterType = store.filters.type ?? "all";

  const statusOptions: Array<{
    label: string;
    active: boolean;
    onClick: () => void;
  }> = [
    {
      label: "全部",
      active: store.filters.completed === undefined && !store.filters.overdue,
      onClick: () =>
        store.setFilters({ completed: undefined, overdue: undefined }),
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

  const typeOptions: Array<{ label: string; value: TodoItemType | "all" }> = [
    { label: "全部", value: "all" },
    { label: "普通", value: "normal" },
    { label: "截止", value: "deadline" },
    { label: "计划", value: "planned" },
    { label: "周期", value: "recurring" },
  ];

  return (
    <motion.div
      initial={motionProps.initial}
      animate={motionProps.animate}
      exit={motionProps.exit}
      className="mobile-kb-screen fixed inset-0 z-50 flex flex-col bg-gray-50 dark:bg-black"
    >
      <header className="mobile-topbar topbar-immersive flex items-center px-2">
        {searchBarOpen ? (
          <>
            <div className="flex flex-1 items-center gap-2 rounded-full bg-gray-100 px-3 dark:bg-neutral-800">
              <Search size={15} className="shrink-0 text-gray-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchInput}
                onChange={(e) => {
                  setSearchInput(e.target.value);
                  store.setFilters({
                    keyword: e.target.value.trim() || undefined,
                  });
                }}
                placeholder="搜索任务"
                className="h-9 flex-1 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400 dark:text-neutral-100"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchInput("");
                    store.setFilters({ keyword: undefined });
                  }}
                  className="shrink-0 text-gray-400"
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
              className="ml-2 shrink-0 text-sm text-(--color-primary)"
            >
              取消
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onBack}
              className="flex h-10 w-10 items-center justify-center rounded-full text-gray-600 transition-colors active:bg-gray-100 dark:text-neutral-300 dark:active:bg-neutral-800"
            >
              <ChevronLeft size={20} aria-hidden="true" />
            </button>
            <h1 className="flex-1 text-center text-base font-semibold text-gray-900 dark:text-neutral-100">
              任务管理
            </h1>
            <button
              type="button"
              onClick={() => {
                setSearchInput(store.filters.keyword ?? "");
                setSearchBarOpen(true);
              }}
              className="flex h-10 w-10 items-center justify-center rounded-full text-gray-600 transition-colors active:bg-gray-100 dark:text-neutral-300 dark:active:bg-neutral-800"
              aria-label="搜索"
            >
              <Search size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setPlusSheetOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-full text-gray-600 transition-colors active:bg-gray-100 dark:text-neutral-300 dark:active:bg-neutral-800"
              aria-label="新建"
            >
              <Plus size={18} aria-hidden="true" />
            </button>
          </>
        )}
      </header>

      <TodoGroupTabs
        groups={customGroups}
        activeGroupId={store.activeGroupId}
        groupStats={store.groupStats}
        onSelect={(groupId) => {
          void store.setActiveGroup(groupId).catch((error) => {
            onError(error, "加载任务列表失败");
          });
        }}
      />

      <div className="mx-4 mb-2 rounded-xl bg-white px-3 py-2.5 dark:bg-neutral-900">
        <div className="flex items-center gap-2">
          <span className="w-8 shrink-0 text-xs text-gray-400 dark:text-neutral-500">
            状态
          </span>
          <div className="flex gap-1.5">
            {statusOptions.map((opt) => (
              <button
                key={opt.label}
                type="button"
                onClick={opt.onClick}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  opt.active
                    ? "bg-(--color-primary) text-white"
                    : "text-gray-500 dark:text-neutral-400"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span className="w-8 shrink-0 text-xs text-gray-400 dark:text-neutral-500">
            类型
          </span>
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
            {typeOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => store.setFilters({ type: opt.value })}
                className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  activeFilterType === opt.value
                    ? "bg-(--color-primary) text-white"
                    : "text-gray-500 dark:text-neutral-400"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div
        ref={listScrollRef}
        className="mobile-kb-scroll flex-1 overflow-y-auto"
      >
        {store.loading.items ? (
          <div className="px-4 py-8 text-center text-sm text-gray-500 dark:text-neutral-400">
            正在加载任务...
          </div>
        ) : (
          <TodoItemTree
            items={filteredItems}
            allItems={activeItems}
            scrollContainerRef={listScrollRef}
            isVisible={isVisible}
            activeTodoId={store.activeTodoId}
            onOpenDetail={(item) => {
              store.setActiveTodo(item.id);
              onOpenDetail(item.id, item.groupId);
            }}
            onToggleComplete={(item, isCompleted) => {
              void handleToggleComplete(item, isCompleted);
            }}
            onOpenActions={(item) => {
              handleOpenActions(item);
            }}
            onMoveAndReorder={handleMoveAndReorder}
            enableDragSort={dragSortEnabled}
          />
        )}
      </div>

      {/* 新增分组 Sheet */}
      <BottomSheet
        open={groupSheetOpen}
        title="新增分组"
        onClose={() => setGroupSheetOpen(false)}
      >
        <input
          ref={groupInputRef}
          type="text"
          value={newGroupTitle}
          onChange={(e) => setNewGroupTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleCreateGroup();
          }}
          placeholder="请输入分组名称"
          className="input-base h-11 w-full rounded-xl px-4 text-sm"
        />
        <button
          type="button"
          onClick={() => void handleCreateGroup()}
          disabled={creatingGroup || !newGroupTitle.trim()}
          className="mt-3 h-11 w-full rounded-xl bg-(--color-primary) text-sm font-semibold text-white disabled:opacity-50 active:opacity-80"
        >
          创建
        </button>
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
          onChange={(e) => setSubSheetTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleCreateRelative();
          }}
          placeholder="请输入任务标题"
          className="input-base h-11 w-full rounded-xl px-4 text-sm"
        />
        <button
          type="button"
          onClick={() => void handleCreateRelative()}
          disabled={!subSheetTitle.trim()}
          className="mt-3 h-11 w-full rounded-xl bg-(--color-primary) text-sm font-semibold text-white disabled:opacity-50 active:opacity-80"
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
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleCreateItem();
          }}
          placeholder="请输入任务标题"
          className="input-base h-11 w-full rounded-xl px-4 text-sm"
        />
        <button
          type="button"
          onClick={() => setTypeSheetOpen(true)}
          className="mt-3 flex w-full items-center justify-between rounded-xl bg-gray-50 px-4 py-3 dark:bg-neutral-800"
        >
          <span className="text-sm text-gray-500 dark:text-neutral-400">
            类型
          </span>
          <span className="text-sm font-medium text-gray-900 dark:text-neutral-100">
            {TYPE_LABELS[newType]}
          </span>
        </button>
        <button
          type="button"
          onClick={() => void handleCreateItem()}
          disabled={!newTitle.trim()}
          className="mt-3 h-11 w-full rounded-xl bg-(--color-primary) text-sm font-semibold text-white disabled:opacity-50 active:opacity-80"
        >
          创建
        </button>
      </BottomSheet>

      {/* 类型选择 ActionSheet */}
      <ActionSheet
        open={typeSheetOpen}
        title="选择任务类型"
        items={(
          ["normal", "deadline", "planned", "recurring"] as TodoItemType[]
        ).map((t) => ({
          label: TYPE_LABELS[t],
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
        items={actionSheetItems}
        onClose={() => setActionSheetOpen(false)}
      />
    </motion.div>
  );
}

export default TodoPage;
