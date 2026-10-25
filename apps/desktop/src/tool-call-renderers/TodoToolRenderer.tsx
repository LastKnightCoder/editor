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

const TodoToolRenderer = ({ execution, isDark, renderDefault }: ToolCallCustomRendererProps) => {
  const data = useMemo(() => parseTodoRendererOutput(execution.output), [execution.output]);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  if (!data) {
    return <>{renderDefault()}</>;
  }

  const renderItems = (items: TodoQueryItem[]) => {
    if (items.length === 0) {
      return (
        <div className="text-tau-sm text-ink-3 px-3 py-4 text-center">当前没有符合条件的任务</div>
      );
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
                  {isExpanded ? "收起" : `展开全部（+${groupItems.length - 10}）`}
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
          {data.type === "todo-dashboard" ? "任务列表总览" : "任务列表查询结果"}
        </ToolSectionTitle>
        <ToolMutedText>历史查询快照；请重新查询后操作。</ToolMutedText>
        <ToolMutedText isDark={isDark} className="mt-0.5 tabular-nums">
          共 {summary.totalCount} 项，未完成 {summary.pendingCount}，已完成 {summary.completedCount}
          ，逾期 {summary.overdueCount}
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
                {summary.completedCount}/{summary.totalCount} 已完成
                {summary.overdueCount > 0 && ` · ${summary.overdueCount} 项逾期`}
              </ToolMutedText>
            </div>

            {renderGroupedItems(data.items, data.groupBuckets)}
          </div>
        ) : (
          <div className="space-y-4">
            <ToolMutedText isDark={isDark} className="tabular-nums">
              第 {data.page}/{data.totalPages} 页 · 当前展示 {data.items.length} 条
            </ToolMutedText>
            {renderGroupedItems(data.items, data.groups)}
          </div>
        )}
      </ToolCardBody>
    </ToolCard>
  );
};

export default TodoToolRenderer;
