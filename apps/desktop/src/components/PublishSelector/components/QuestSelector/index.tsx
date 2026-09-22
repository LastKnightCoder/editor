import { memo, useMemo, useState, useCallback } from "react";
import clsx from "clsx";
import { RefreshCw, Search, X } from "lucide-react";
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
    title: "text-ink-2",
    badge: "bg-group text-ink-2",
    dot: "bg-sunken",
  },
  in_progress: {
    title: "text-warn",
    badge: "bg-warn-soft text-warn",
    dot: "bg-warn",
  },
  resolved: {
    title: "text-ok",
    badge: "bg-ok-soft text-ok",
    dot: "bg-ok",
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
      <div className="border-line-1 rounded-tau-md flex max-h-[560px] min-h-[480px] overflow-hidden border">
        <div className="border-line-1 flex w-60 shrink-0 flex-col border-r">
          <div className="border-line-1 text-ink-1 flex shrink-0 items-center justify-between border-b px-4 py-3 text-[13px] font-medium">
            <span>分类</span>
            <span className="text-tau-tiny text-ink-3 tabular-nums">{groupItems.length}</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto py-2">
            {groupItems.length === 0 ? (
              <div className="text-ink-3 p-4 text-center text-[13px]">暂无分类</div>
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
          <div className="border-line-2 shrink-0 border-b px-3 py-3">
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
  return (
    <div className="px-2 py-1">
      <div
        className={clsx(
          "flex items-center gap-2 rounded-md px-2 py-2 transition-colors",
          active ? "bg-selected" : "hover:bg-hover"
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
            className={clsx(
              "min-w-0 flex-1 truncate text-[13px]",
              active ? "text-ink-1 font-medium" : "text-ink-2"
            )}
          >
            {group.title}
          </span>
          <span
            className={clsx(
              "shrink-0 text-[11px] tabular-nums",
              selectedCount > 0 ? "text-ink-1 font-medium" : "text-ink-3"
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
    return (
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <span className="text-ink-3 pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5">
              {isFiltering ? (
                <RefreshCw size={14} strokeWidth={1.75} className="animate-spin" />
              ) : (
                <Search size={14} strokeWidth={1.75} />
              )}
            </span>
            <input
              type="text"
              value={query}
              onChange={event => onQueryChange(event.target.value)}
              placeholder="搜索标题或描述…"
              className={clsx(
                "border-line-1 bg-surface text-ink-1 placeholder:text-ink-3",
                "focus:border-accent rounded-tau-sm h-[30px] w-full border pl-8 pr-8 text-[12.5px]",
                "transition-colors focus:outline-none"
              )}
            />
            {query && (
              <button
                type="button"
                onClick={() => onQueryChange("")}
                aria-label="清空搜索"
                className="text-ink-3 hover:text-ink-1 absolute inset-y-0 right-0 flex items-center pr-2.5"
              >
                <X size={14} strokeWidth={1.75} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {showSelectAll && (
              <button
                type="button"
                onClick={onSelectAll}
                className="border-line-1 text-ink-2 hover:border-ink-3 hover:bg-hover flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] transition-colors"
              >
                <SelectionCheckbox checked={allSelected} size="sm" interactive={false} />
                <span>{allSelected ? "取消全选" : "全选"}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onOnlySelectedChange(!onlySelected)}
              className={clsx(
                "rounded-full border px-2.5 py-1 text-[11.5px] transition-colors",
                onlySelected
                  ? "bg-accent-soft text-accent-text border-transparent font-semibold"
                  : "border-line-1 text-ink-2 hover:border-ink-3 hover:bg-hover"
              )}
            >
              仅显示已选
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {STATUS_OPTIONS.map(option => (
            <button
              key={option.value}
              type="button"
              onClick={() => onStatusFilterChange(option.value)}
              className={clsx(
                "rounded-full border px-2.5 py-0.5 text-[11px] transition-colors",
                statusFilter === option.value
                  ? "bg-accent-soft text-accent-text border-transparent font-semibold"
                  : "border-line-1 text-ink-3 hover:border-ink-3 hover:bg-hover"
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
  const statusStyle = STATUS_STYLE[question.status];

  return (
    <button
      type="button"
      onClick={onToggle}
      className={clsx(
        "rounded-tau-sm flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors",
        selected ? "bg-selected" : "hover:bg-hover"
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
          <span className={clsx("h-2 w-2 rounded-full", statusStyle.dot)} />
          <span className={clsx("rounded-full px-2 py-px text-[11px]", statusStyle.badge)}>
            {STATUS_LABEL[question.status]}
          </span>
          <span className="text-tau-tiny text-ink-3 tabular-nums">
            {question.answers.length} 答案
          </span>
        </div>
        <div
          className={clsx(
            "line-clamp-2 text-[13px] font-medium leading-5",
            selected ? "text-ink-1" : statusStyle.title
          )}
        >
          {question.questionContent || `条目 #${question.id}`}
        </div>
        <div className="text-tau-tiny text-ink-3 mt-1 line-clamp-2 leading-5">
          {getQuestSummary(question)}
        </div>
      </div>
    </button>
  );
});

QuestQuestionRow.displayName = "QuestQuestionRow";
