import { memo, useMemo, useState, useCallback } from "react";
import classNames from "classnames";
import useThemeColors from "@/hooks/useThemeColors";
import { PublishContentType } from "@/types/publish";
import { IQuestion } from "@/types/question";
import { QuestionGroupDTO } from "@/commands/question-group";
import { EntityScope } from "../../types";
import { SelectionCheckbox } from "../SelectionCheckbox";
import { EmptyPlaceholder } from "../EmptyPlaceholder";
import { useSearch } from "../../hooks";

interface QuestGroupItem {
  id: number;
  title: string;
  questions: IQuestion[];
  raw: QuestionGroupDTO;
}

interface QuestSearchItem extends IQuestion {
  searchable: string;
}

interface QuestSelectorProps {
  groups: QuestionGroupDTO[];
  questions: IQuestion[];
  isItemSelected: (type: PublishContentType, id: number) => boolean;
  scopes: Map<number, EntityScope>;
  onToggleGroup: (id: number, enabled: boolean) => Promise<void>;
  onUpdateScope: (groupId: number, scope: EntityScope) => Promise<void>;
}

type StatusFilter = "all" | IQuestion["status"];

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "not_started", label: "未开始" },
  { value: "in_progress", label: "进行中" },
  { value: "resolved", label: "已解决" },
];

const STATUS_LABEL: Record<IQuestion["status"], string> = {
  not_started: "未开始",
  in_progress: "进行中",
  resolved: "已解决",
};

const STATUS_STYLE: Record<IQuestion["status"], { title: string; badge: string; dot: string }> = {
  not_started: {
    title: "text-zinc-600 dark:text-zinc-300",
    badge:
      "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700",
    dot: "bg-zinc-400",
  },
  in_progress: {
    title: "text-amber-700 dark:text-amber-300",
    badge:
      "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30",
    dot: "bg-amber-500",
  },
  resolved: {
    title: "text-status-success",
    badge: "bg-[var(--th-success)]/10 text-status-success border-[var(--th-success)]/30",
    dot: "bg-status-success",
  },
};

function getQuestSummary(question: IQuestion): string {
  const text = extractText(question.description || []);
  if (text) {
    return text.length > 96 ? `${text.slice(0, 96)}...` : text;
  }
  return question.answers.length > 0 ? `已有 ${question.answers.length} 个答案` : "暂未记录答案";
}

function extractText(nodes: unknown[]): string {
  const parts: string[] = [];
  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    if (typeof record.text === "string") {
      parts.push(record.text);
    }
    if (Array.isArray(record.children)) {
      record.children.forEach(visit);
    }
  };
  nodes.forEach(visit);
  return parts.join("").trim();
}

function resolveSelectedIds(
  group: QuestGroupItem,
  selected: boolean,
  scope?: EntityScope
): Set<number> {
  if (!selected) {
    return new Set();
  }
  if (!scope || scope.mode === "all") {
    return new Set(group.questions.map(question => question.id));
  }
  return new Set(scope.nodeIds);
}

function getGroupSelectedCount(
  group: QuestGroupItem,
  isItemSelected: (type: PublishContentType, id: number) => boolean,
  scope?: EntityScope
): number {
  return resolveSelectedIds(group, isItemSelected("quest", group.id), scope).size;
}

export const QuestSelector = memo<QuestSelectorProps>(
  ({ groups, questions, isItemSelected, scopes, onToggleGroup, onUpdateScope }) => {
    const themeColors = useThemeColors();
    const [activeGroupId, setActiveGroupId] = useState<number | null>(null);
    const [onlySelected, setOnlySelected] = useState(false);
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

    const groupItems = useMemo<QuestGroupItem[]>(() => {
      const questionsByGroup = new Map<number, IQuestion[]>();
      questions.forEach(question => {
        const items = questionsByGroup.get(question.groupId) || [];
        items.push(question);
        questionsByGroup.set(question.groupId, items);
      });

      return groups
        .map(group => ({
          id: group.id,
          title: group.title || `分组 #${group.id}`,
          questions: (questionsByGroup.get(group.id) || []).sort(
            (a, b) => a.sortIndex - b.sortIndex || a.createTime - b.createTime
          ),
          raw: group,
        }))
        .filter(group => group.questions.length > 0);
    }, [groups, questions]);

    const activeGroup = useMemo(() => {
      if (activeGroupId == null) {
        return groupItems[0] || null;
      }
      return groupItems.find(group => group.id === activeGroupId) || groupItems[0] || null;
    }, [activeGroupId, groupItems]);

    const activeSelectedIds = useMemo(
      () =>
        activeGroup
          ? resolveSelectedIds(
              activeGroup,
              isItemSelected("quest", activeGroup.id),
              scopes.get(activeGroup.id)
            )
          : new Set<number>(),
      [activeGroup, isItemSelected, scopes]
    );

    const searchItems = useMemo<QuestSearchItem[]>(
      () =>
        (activeGroup?.questions || []).map(question => ({
          ...question,
          searchable: [
            question.questionContent,
            getQuestSummary(question),
            STATUS_LABEL[question.status],
          ].join(" "),
        })),
      [activeGroup]
    );

    const { query, setQuery, filteredItems, isFiltering } = useSearch({
      items: searchItems,
      searchFields: ["questionContent", "searchable"],
    });

    const displayQuestions = useMemo(() => {
      let items = filteredItems;
      if (statusFilter !== "all") {
        items = items.filter(question => question.status === statusFilter);
      }
      if (onlySelected) {
        items = items.filter(question => activeSelectedIds.has(question.id));
      }
      return items;
    }, [activeSelectedIds, filteredItems, onlySelected, statusFilter]);

    const allSelected = useMemo(
      () =>
        displayQuestions.length > 0 &&
        displayQuestions.every(question => activeSelectedIds.has(question.id)),
      [activeSelectedIds, displayQuestions]
    );

    const updateActiveScope = useCallback(
      async (nextIds: Set<number>) => {
        if (!activeGroup) return;
        await onUpdateScope(
          activeGroup.id,
          nextIds.size === activeGroup.questions.length
            ? { mode: "all" }
            : { mode: "partial", nodeIds: nextIds }
        );
      },
      [activeGroup, onUpdateScope]
    );

    const handleSelectAll = useCallback(async () => {
      if (!activeGroup) return;
      if (allSelected) {
        const nextIds = new Set(activeSelectedIds);
        displayQuestions.forEach(question => nextIds.delete(question.id));
        await updateActiveScope(nextIds);
        return;
      }
      const nextIds = new Set(activeSelectedIds);
      displayQuestions.forEach(question => nextIds.add(question.id));
      await updateActiveScope(nextIds);
    }, [activeGroup, activeSelectedIds, allSelected, displayQuestions, updateActiveScope]);

    const toggleQuestion = useCallback(
      async (questionId: number) => {
        const nextIds = new Set(activeSelectedIds);
        if (nextIds.has(questionId)) {
          nextIds.delete(questionId);
        } else {
          nextIds.add(questionId);
        }
        await updateActiveScope(nextIds);
      },
      [activeSelectedIds, updateActiveScope]
    );

    return (
      <div
        className={classNames(
          "flex max-h-[560px] min-h-[480px] overflow-hidden rounded-xl border",
          themeColors.cardBorderClass
        )}
      >
        <div
          className={classNames(
            "flex w-60 flex-shrink-0 flex-col border-r",
            themeColors.cardBorderClass
          )}
        >
          <div
            className={classNames(
              "flex flex-shrink-0 items-center justify-between border-b px-4 py-3 text-sm font-medium",
              themeColors.cardBorderClass,
              themeColors.textClass
            )}
          >
            <span>分类</span>
            <span className={classNames("text-xs", themeColors.secondaryTextClass)}>
              {groupItems.length}
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto py-2">
            {groupItems.length === 0 ? (
              <div
                className={classNames("p-4 text-center text-sm", themeColors.secondaryTextClass)}
              >
                暂无分类
              </div>
            ) : (
              groupItems.map(group => (
                <QuestGroupButton
                  key={group.id}
                  group={group}
                  active={activeGroup?.id === group.id}
                  selectedCount={getGroupSelectedCount(group, isItemSelected, scopes.get(group.id))}
                  onSelect={() => setActiveGroupId(group.id)}
                  onToggle={() => onToggleGroup(group.id, !isItemSelected("quest", group.id))}
                />
              ))
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex-shrink-0 border-b border-gray-100 px-3 py-3 dark:border-zinc-800">
            <QuestToolbar
              query={query}
              onQueryChange={setQuery}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
              onlySelected={onlySelected}
              onOnlySelectedChange={setOnlySelected}
              showSelectAll={displayQuestions.length > 0}
              allSelected={allSelected}
              onSelectAll={handleSelectAll}
              isFiltering={isFiltering}
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
            {!activeGroup ? (
              <EmptyPlaceholder text="暂无问题分类" />
            ) : displayQuestions.length === 0 ? (
              <EmptyPlaceholder
                text={
                  onlySelected
                    ? "暂无已选条目"
                    : query || statusFilter !== "all"
                      ? "无匹配结果"
                      : "此分类下暂无条目"
                }
              />
            ) : (
              <div className="space-y-2">
                {displayQuestions.map(question => (
                  <QuestQuestionRow
                    key={question.id}
                    question={question}
                    selected={activeSelectedIds.has(question.id)}
                    onToggle={() => toggleQuestion(question.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
);

QuestSelector.displayName = "QuestSelector";

const QuestGroupButton = memo<{
  group: QuestGroupItem;
  active: boolean;
  selectedCount: number;
  onSelect: () => void;
  onToggle: () => void;
}>(({ group, active, selectedCount, onSelect, onToggle }) => {
  const themeColors = useThemeColors();

  return (
    <div className="px-2 py-1">
      <div
        className={classNames(
          "flex items-center gap-2 rounded-lg px-2 py-2 transition-colors",
          active
            ? "bg-zinc-200/70 dark:bg-zinc-700/60"
            : "hover:bg-gray-50 dark:hover:bg-zinc-800/30"
        )}
      >
        <SelectionCheckbox
          checked={selectedCount === group.questions.length}
          indeterminate={selectedCount > 0 && selectedCount < group.questions.length}
          onChange={onToggle}
          size="sm"
        />
        <button
          type="button"
          onClick={onSelect}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span
            className={classNames(
              "min-w-0 flex-1 truncate text-sm",
              active ? "font-medium text-zinc-900 dark:text-zinc-100" : themeColors.textClass
            )}
          >
            {group.title}
          </span>
          <span
            className={classNames(
              "flex-shrink-0 text-xs",
              selectedCount > 0
                ? "font-medium text-zinc-800 dark:text-zinc-100"
                : themeColors.secondaryTextClass
            )}
          >
            {selectedCount > 0
              ? `${selectedCount}/${group.questions.length}`
              : group.questions.length}
          </span>
        </button>
      </div>
    </div>
  );
});

QuestGroupButton.displayName = "QuestGroupButton";

const QuestToolbar = memo<{
  query: string;
  onQueryChange: (query: string) => void;
  statusFilter: StatusFilter;
  onStatusFilterChange: (value: StatusFilter) => void;
  onlySelected: boolean;
  onOnlySelectedChange: (value: boolean) => void;
  showSelectAll: boolean;
  allSelected: boolean;
  onSelectAll: () => void;
  isFiltering: boolean;
}>(
  ({
    query,
    onQueryChange,
    statusFilter,
    onStatusFilterChange,
    onlySelected,
    onOnlySelectedChange,
    showSelectAll,
    allSelected,
    onSelectAll,
    isFiltering,
  }) => {
    const themeColors = useThemeColors();

    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <svg
                className={classNames(
                  "h-4 w-4",
                  isFiltering ? "animate-spin" : "",
                  themeColors.secondaryTextClass
                )}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
            <input
              type="text"
              value={query}
              onChange={event => onQueryChange(event.target.value)}
              placeholder="搜索标题或描述..."
              className={classNames(
                "w-full rounded-lg border py-2 pl-10 pr-4 text-sm transition-colors",
                "bg-zinc-50 dark:bg-zinc-800/80",
                "border-zinc-200 dark:border-zinc-700/80",
                themeColors.textClass,
                "placeholder:text-gray-400 dark:placeholder:text-gray-500",
                "focus:outline-none",
                themeColors.focusRingClass
              )}
            />
            {query && (
              <button
                type="button"
                onClick={() => onQueryChange("")}
                className={classNames(
                  "absolute inset-y-0 right-0 flex items-center pr-3",
                  themeColors.secondaryTextClass,
                  "hover:text-gray-600 dark:hover:text-gray-300"
                )}
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {showSelectAll && (
              <button
                type="button"
                onClick={onSelectAll}
                className={classNames(
                  "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
                  themeColors.cardBgClass,
                  themeColors.cardBorderClass,
                  themeColors.hoverClass,
                  themeColors.textClass
                )}
              >
                <span>{allSelected ? "取消全选" : "全选"}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onOnlySelectedChange(!onlySelected)}
              className={classNames(
                "rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
                onlySelected
                  ? [themeColors.activeClass, themeColors.activeBorderClass]
                  : [
                      themeColors.cardBgClass,
                      themeColors.cardBorderClass,
                      themeColors.hoverClass,
                      themeColors.textClass,
                    ]
              )}
            >
              仅显示已选
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {STATUS_OPTIONS.map(option => (
            <button
              key={option.value}
              type="button"
              onClick={() => onStatusFilterChange(option.value)}
              className={classNames(
                "rounded-lg border px-2.5 py-1.5 text-xs transition-colors",
                statusFilter === option.value
                  ? [themeColors.activeClass, themeColors.activeBorderClass]
                  : [
                      themeColors.cardBgClass,
                      themeColors.cardBorderClass,
                      themeColors.hoverClass,
                      themeColors.secondaryTextClass,
                    ]
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    );
  }
);

QuestToolbar.displayName = "QuestToolbar";

const QuestQuestionRow = memo<{
  question: IQuestion;
  selected: boolean;
  onToggle: () => void;
}>(({ question, selected, onToggle }) => {
  const themeColors = useThemeColors();
  const statusStyle = STATUS_STYLE[question.status];

  return (
    <button
      type="button"
      onClick={onToggle}
      className={classNames(
        "flex w-full items-start gap-3 rounded-lg px-4 py-3.5 text-left transition-colors",
        selected
          ? "bg-zinc-200/60 dark:bg-zinc-700/50"
          : "hover:bg-gray-50 dark:hover:bg-zinc-800/30"
      )}
    >
      <SelectionCheckbox
        checked={selected}
        onChange={() => undefined}
        interactive={false}
        size="sm"
      />
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <span className={classNames("h-2 w-2 rounded-full", statusStyle.dot)} />
          <span
            className={classNames("rounded-md border px-1.5 py-0.5 text-[11px]", statusStyle.badge)}
          >
            {STATUS_LABEL[question.status]}
          </span>
          <span className={classNames("text-xs", themeColors.secondaryTextClass)}>
            {question.answers.length} 答案
          </span>
        </div>
        <div
          className={classNames(
            "line-clamp-2 text-sm font-medium leading-5",
            selected ? "text-zinc-950 dark:text-zinc-50" : statusStyle.title
          )}
        >
          {question.questionContent || `条目 #${question.id}`}
        </div>
        <div
          className={classNames(
            "mt-1 line-clamp-2 text-xs leading-5",
            themeColors.secondaryTextClass
          )}
        >
          {getQuestSummary(question)}
        </div>
      </div>
    </button>
  );
});

QuestQuestionRow.displayName = "QuestQuestionRow";
