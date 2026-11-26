import { useMemo, useState } from "react";
import type { ToolCallCustomRendererProps } from "./types";
import type { TodoQueryItem } from "@/types";
import {
  ToolCard,
  ToolCardBody,
  ToolCardHeader,
  ToolDividerList,
  ToolDividerListItem,
  ToolMutedText,
  ToolProgressBar,
  ToolSectionTitle,
} from "@tau/chat-ui";
import TodoRowCard from "./todo/TodoRowCard";
import { parseTodoRendererOutput } from "./todo/utils";

import { useTodoToolI18n } from "./todo.i18n";

const TodoToolRenderer = ({ execution, isDark, renderDefault }: ToolCallCustomRendererProps) => {
  const { t } = useTodoToolI18n();
  const data = useMemo(() => parseTodoRendererOutput(execution.output), [execution.output]);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  if (!data) {
    return <>{renderDefault()}</>;
  }

  const renderItems = (items: TodoQueryItem[]) => {
    if (items.length === 0) {
      return <div className="text-tau-sm text-ink-3 px-3 py-4 text-center">{t("todo.empty")}</div>;
    }

    return (
      <ToolDividerList isDark={isDark}>
        {items.map(item => (
          <ToolDividerListItem key={item.id} isDark={isDark}>
            <TodoRowCard item={item} isDark={isDark} />
          </ToolDividerListItem>
        ))}
      </ToolDividerList>
    );
  };

  const renderGroupedItems = (
    items: TodoQueryItem[],
    groups: Array<{
      key: string;
      label: string;
      itemIds: number[];
      totalCount: number;
    }>
  ) => {
    if (items.length === 0) {
      return renderItems(items);
    }

    const itemMap = new Map(items.map(item => [item.id, item]));

    return (
      <div className="space-y-4">
        {groups.map(group => {
          const groupItems = group.itemIds
            .map(itemId => itemMap.get(itemId))
            .filter(Boolean) as TodoQueryItem[];

          if (groupItems.length === 0) {
            return null;
          }

          const isExpanded = expandedGroups[group.key] ?? false;
          const displayItems = isExpanded ? groupItems : groupItems.slice(0, 10);
          const hasMore = groupItems.length > 10;

          return (
            <div key={group.key} className="space-y-2">
              <div className="text-tau-tiny text-ink-3 font-medium tabular-nums">
                {group.label} · {group.totalCount}
              </div>
              {renderItems(displayItems)}
              {hasMore && (
                <button
                  type="button"
                  className="text-tau-sm text-accent-text hover:bg-hover rounded-tau-sm ease-tau-out w-full cursor-pointer py-1.5 text-center transition-colors duration-150"
                  onClick={() =>
                    setExpandedGroups(prev => ({
                      ...prev,
                      [group.key]: !isExpanded,
                    }))
                  }
                >
                  {isExpanded
                    ? t("todo.collapse")
                    : t("todo.expand", { count: groupItems.length - 10 })}
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
    <ToolCard isDark={isDark}>
      <ToolCardHeader isDark={isDark}>
        <ToolSectionTitle isDark={isDark}>
          {data.type === "todo-dashboard" ? t("todo.dashboard") : t("todo.query")}
        </ToolSectionTitle>
        <ToolMutedText>{t("todo.historical")}</ToolMutedText>
        <ToolMutedText isDark={isDark} className="mt-0.5 tabular-nums">
          {t("todo.summary", {
            total: summary.totalCount,
            pending: summary.pendingCount,
            completed: summary.completedCount,
            overdue: summary.overdueCount,
          })}
        </ToolMutedText>
      </ToolCardHeader>

      <ToolCardBody>
        {data.type === "todo-dashboard" ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <ToolProgressBar
                isDark={isDark}
                segments={[
                  { value: summary.completedCount, color: "var(--tau-ok)" },
                  {
                    value: summary.pendingCount - summary.overdueCount,
                    color: "var(--tau-line-1)",
                  },
                  { value: summary.overdueCount, color: "var(--tau-danger)" },
                ]}
              />
              <ToolMutedText isDark={isDark} className="tabular-nums">
                {t("todo.completion", {
                  completed: summary.completedCount,
                  total: summary.totalCount,
                })}
                {summary.overdueCount > 0 &&
                  t("todo.overdueCount", { count: summary.overdueCount })}
              </ToolMutedText>
            </div>

            {renderGroupedItems(data.items, data.groupBuckets)}
          </div>
        ) : (
          <div className="space-y-4">
            <ToolMutedText isDark={isDark} className="tabular-nums">
              {t("todo.page", {
                page: data.page,
                total: data.totalPages,
                count: data.items.length,
              })}
            </ToolMutedText>
            {renderGroupedItems(data.items, data.groups)}
          </div>
        )}
      </ToolCardBody>
    </ToolCard>
  );
};

export default TodoToolRenderer;
