import { useEffect, useMemo, useState } from "react";
import type { ToolCallCustomRendererProps } from "./types";
import type { TodoQueryItem, TodoQueryRequest } from "@/types";
import { toggleCompleteCascade } from "@/commands/todo";
import { subscribeTodoMutationEvent } from "@/mcp/todo/events";
import { executeTodoQuery, getTodoDashboardData } from "@/mcp/todo/query";
import {
  emitTodoMutation,
  shouldRefreshTodoQueryResult,
  TODO_MUTATION_ACTIONS,
} from "@/mcp/todo/mutation";
import TodoRowCard from "./todo/TodoRowCard";
import { parseTodoRendererOutput, type TodoRendererData } from "./todo/utils";

const TodoToolRenderer = ({
  execution,
  isDark,
  parsedInput,
  renderDefault,
}: ToolCallCustomRendererProps) => {
  const initialData = useMemo(
    () => parseTodoRendererOutput(execution.output),
    [execution.output],
  );
  const [data, setData] = useState<TodoRendererData>(initialData);
  const [loading, setLoading] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(
    {},
  );
  const querySpec = useMemo(
    () =>
      execution.toolName === "query_todos"
        ? ((parsedInput ?? {}) as TodoQueryRequest)
        : null,
    [execution.toolName, parsedInput],
  );

  const refresh = async () => {
    setLoading(true);
    try {
      const next =
        execution.toolName === "get_todo_dashboard"
          ? await getTodoDashboardData()
          : await executeTodoQuery(querySpec ?? {});
      setData(next);
    } catch (error) {
      console.error("[todo-renderer] refresh failed", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  useEffect(() => {
    return subscribeTodoMutationEvent((event) => {
      if (data?.type === "todo-dashboard") {
        void refresh();
        return;
      }

      const currentQueryResult =
        data?.type === "todo-query-result" ? data : null;
      if (
        shouldRefreshTodoQueryResult({
          event,
          query: querySpec,
          currentResult: currentQueryResult,
        })
      ) {
        void refresh();
      }
    });
  }, [data, execution.toolName, querySpec]);

  if (!data) {
    return <>{renderDefault()}</>;
  }

  const handleToggleComplete = async (item: TodoQueryItem) => {
    await toggleCompleteCascade(item.id, !item.isCompleted);
    emitTodoMutation({
      source: "todo-renderer",
      entityType: "item",
      entityId: item.id,
      groupId: item.groupId,
      action: item.isCompleted
        ? TODO_MUTATION_ACTIONS.UNCOMPLETE_ITEM
        : TODO_MUTATION_ACTIONS.COMPLETE_ITEM,
      changedFields: ["isCompleted", "completedAt"],
    });
  };

  const renderItems = (items: TodoQueryItem[]) => {
    if (items.length === 0) {
      return (
        <div
          className={`rounded-lg border px-3 py-4 text-center text-sm ${
            isDark
              ? "border-white/10 text-slate-400"
              : "border-slate-200 text-slate-500"
          }`}
        >
          当前没有符合条件的任务
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {items.map((item) => (
          <TodoRowCard
            key={item.id}
            item={item}
            isDark={isDark}
            onToggleComplete={handleToggleComplete}
          />
        ))}
      </div>
    );
  };

  const renderGroupedItems = (
    items: TodoQueryItem[],
    groups: Array<{
      key: string;
      label: string;
      itemIds: number[];
      totalCount: number;
    }>,
  ) => {
    if (items.length === 0) {
      return renderItems(items);
    }

    const itemMap = new Map(items.map((item) => [item.id, item]));

    return (
      <div className="space-y-4">
        {groups.map((group) => {
          const groupItems = group.itemIds
            .map((itemId) => itemMap.get(itemId))
            .filter(Boolean) as TodoQueryItem[];

          if (groupItems.length === 0) {
            return null;
          }

          const isExpanded = expandedGroups[group.key] ?? false;
          const displayItems = isExpanded
            ? groupItems
            : groupItems.slice(0, 10);
          const hasMore = groupItems.length > 10;

          return (
            <div key={group.key} className="space-y-2">
              <div
                className={`pb-2 text-sm font-semibold ${isDark ? "text-slate-400" : "text-slate-600"}`}
              >
                {group.label} · {group.totalCount}
              </div>
              {renderItems(displayItems)}
              {hasMore && (
                <button
                  className="w-full py-2 text-center text-xs text-blue-500 hover:text-blue-600 hover:underline cursor-pointer"
                  onClick={() =>
                    setExpandedGroups((prev) => ({
                      ...prev,
                      [group.key]: !isExpanded,
                    }))
                  }
                >
                  {isExpanded
                    ? "收起"
                    : `展开全部（+${groupItems.length - 10}）`}
                </button>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const summary = data.summary;
  return (
    <div
      className={`my-3 overflow-hidden rounded-lg border ${
        isDark ? "border-white/10 bg-zinc-900/50" : "border-slate-200 bg-white"
      }`}
    >
      <div
        className={`border-b px-4 py-3 ${isDark ? "border-white/10" : "border-slate-200"}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div
              className={`text-sm font-medium ${isDark ? "text-slate-100" : "text-slate-800"}`}
            >
              {data.type === "todo-dashboard"
                ? "任务列表总览"
                : "任务列表查询结果"}
            </div>
            <div
              className={`mt-1 text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}
            >
              共 {summary.totalCount} 项，未完成 {summary.pendingCount}，已完成{" "}
              {summary.completedCount}，逾期 {summary.overdueCount}
            </div>
          </div>
          <button
            className={`rounded px-3 py-1 text-xs transition-colors ${
              loading
                ? isDark
                  ? "cursor-not-allowed bg-zinc-800 text-slate-500"
                  : "cursor-not-allowed bg-slate-100 text-slate-400"
                : isDark
                  ? "bg-zinc-800 text-slate-200 hover:bg-zinc-700"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
            disabled={loading}
            onClick={() => void refresh()}
          >
            {loading ? "刷新中..." : "刷新"}
          </button>
        </div>
      </div>

      <div className="space-y-4 px-4 py-3">
        {data.type === "todo-dashboard" ? (
          <div className="space-y-4">
            <div className="flex gap-3 overflow-x-auto">
              <div
                className={`min-w-[120px] flex-shrink-0 rounded-lg p-3 ${isDark ? "bg-zinc-950/30" : "bg-slate-50/50"}`}
              >
                <div className="text-xs opacity-70">待处理</div>
                <div className="mt-1 text-2xl font-semibold">
                  {summary.pendingCount}
                </div>
              </div>
              <div
                className={`min-w-[120px] flex-shrink-0 rounded-lg p-3 ${isDark ? "bg-zinc-950/30" : "bg-slate-50/50"}`}
              >
                <div className="text-xs opacity-70">最近完成</div>
                <div className="mt-1 text-2xl font-semibold">
                  {data.recentCompletedItems.length}
                </div>
              </div>
              <div
                className={`min-w-[120px] flex-shrink-0 rounded-lg p-3 ${isDark ? "bg-zinc-950/30" : "bg-slate-50/50"}`}
              >
                <div className="text-xs opacity-70">逾期</div>
                <div className="mt-1 text-2xl font-semibold text-rose-500">
                  {summary.overdueCount}
                </div>
              </div>
            </div>

            {renderGroupedItems(data.items, data.groupBuckets)}
          </div>
        ) : (
          <div className="space-y-4">
            <div
              className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}
            >
              第 {data.page}/{data.totalPages} 页 · 当前展示 {data.items.length}{" "}
              条
            </div>
            {renderGroupedItems(data.items, data.groups)}
          </div>
        )}
      </div>
    </div>
  );
};

export default TodoToolRenderer;
