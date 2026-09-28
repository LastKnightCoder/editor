import dayjs from "dayjs";
import { Node, type Descendant } from "slate";
import {
  getCalendarMappingsByTodoIds,
  getRecurrenceCompletionsByRecurrenceIds,
  getRecurrencesByItemIds,
  getSystemGroups,
  listTodoGroups,
  listTodoItems,
  listTodoItemsByType,
  listTodoNotesByTodoIds,
} from "@/commands/todo";
import { getMarkdown } from "@/utils/markdown";
import type {
  TodoCalendarMapping,
  TodoDashboardResponse,
  TodoGroup,
  TodoItem,
  TodoNoteLink,
  TodoQueryBucket,
  TodoQueryFilter,
  TodoQueryItem,
  TodoQueryRequest,
  TodoQueryResponse,
  TodoQuerySort,
  TodoQuerySummary,
  TodoRecurrence,
  TodoRecurrenceCompletion,
  TodoSystemGroupType,
} from "@/types";

interface TodoBaseContext {
  groups: TodoGroup[];
  groupMap: Map<number, TodoGroup>;
  items: TodoItem[];
}

interface TodoBatchRelations {
  notesByTodoId: Record<number, TodoNoteLink[]>;
  calendarMappingsByTodoId: Record<number, TodoCalendarMapping[]>;
  recurrencesByTodoId: Record<number, TodoRecurrence>;
  recurrenceCompletionsByRecurrenceId: Record<number, TodoRecurrenceCompletion[]>;
}

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

const normalizePage = (value: unknown, fallback: number) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return Math.floor(numeric);
};

const normalizeDescendantsText = (content?: Descendant[]) => {
  if (!content || content.length === 0) {
    return "";
  }

  return content
    .map(node => Node.string(node))
    .join("\n")
    .trim();
};

const normalizeKeyword = (value?: string) => value?.trim().toLowerCase() ?? "";

const normalizeNameSet = (values?: string[]) => {
  return new Set((values || []).map(value => value.trim().toLowerCase()).filter(Boolean));
};

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const normalizeTimeBoundary = (
  value: number | string | null | undefined,
  boundary: "start" | "end"
) => {
  if (value == null) {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (/^\d+$/.test(trimmed)) {
    const numeric = Number(trimmed);
    return Number.isFinite(numeric) ? numeric : null;
  }

  const parsed = dayjs(trimmed);
  if (!parsed.isValid()) {
    return null;
  }

  if (DATE_ONLY_PATTERN.test(trimmed)) {
    return boundary === "start" ? parsed.startOf("day").valueOf() : parsed.endOf("day").valueOf();
  }

  return parsed.valueOf();
};

const buildGroupMap = (groups: TodoGroup[]) => new Map(groups.map(group => [group.id, group]));

const getItemFieldValue = (item: TodoItem, filter: TodoQueryFilter): number | null | undefined => {
  switch (filter.timeField) {
    case "createTime":
      return item.createTime;
    case "updateTime":
      return item.updateTime;
    case "dueAt":
      return item.dueAt;
    case "completedAt":
      return item.completedAt;
    case "startAt":
      return item.startAt;
    default:
      return undefined;
  }
};

const isOverdueItem = (item: TodoItem) =>
  !item.isCompleted && typeof item.dueAt === "number" && item.dueAt < Date.now();

const getStatusBucket = (item: TodoItem) => {
  if (item.isCompleted) {
    return { key: "completed", label: "已完成" };
  }

  if (isOverdueItem(item)) {
    return { key: "overdue", label: "已逾期" };
  }

  return { key: "pending", label: "未完成" };
};

const getDateBucket = (value?: number | null, fallbackLabel = "未设置") => {
  if (!value) {
    return { key: "none", label: fallbackLabel };
  }

  const dateKey = dayjs(value).format("YYYY-MM-DD");
  return {
    key: dateKey,
    label: dateKey,
  };
};

const buildParentChildrenMap = (items: TodoItem[]) => {
  const parentChildrenMap = new Map<number, number[]>();
  items.forEach(item => {
    if (item.parentId == null) {
      return;
    }

    const children = parentChildrenMap.get(item.parentId) ?? [];
    children.push(item.id);
    parentChildrenMap.set(item.parentId, children);
  });

  return parentChildrenMap;
};

const collectDescendantIds = (parentChildrenMap: Map<number, number[]>, parentId: number) => {
  const result = new Set<number>([parentId]);
  const queue = [parentId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const children = parentChildrenMap.get(current) ?? [];
    children.forEach(childId => {
      if (!result.has(childId)) {
        result.add(childId);
        queue.push(childId);
      }
    });
  }

  return result;
};

const sortItems = (items: TodoItem[], groupMap: Map<number, TodoGroup>, sort: TodoQuerySort) => {
  const sorted = [...items];
  sorted.sort((left, right) => {
    switch (sort) {
      case "dueAtAsc": {
        const leftValue = left.dueAt ?? Number.MAX_SAFE_INTEGER;
        const rightValue = right.dueAt ?? Number.MAX_SAFE_INTEGER;
        if (leftValue !== rightValue) {
          return leftValue - rightValue;
        }
        return right.updateTime - left.updateTime;
      }
      case "updateTimeDesc":
        return right.updateTime - left.updateTime;
      case "createTimeDesc":
        return right.createTime - left.createTime;
      case "completedAtDesc": {
        const leftValue = left.completedAt ?? 0;
        const rightValue = right.completedAt ?? 0;
        if (leftValue !== rightValue) {
          return rightValue - leftValue;
        }
        return right.updateTime - left.updateTime;
      }
      case "manual":
      default: {
        const leftGroupSort = groupMap.get(left.groupId)?.sortIndex ?? left.groupId;
        const rightGroupSort = groupMap.get(right.groupId)?.sortIndex ?? right.groupId;
        if (leftGroupSort !== rightGroupSort) {
          return leftGroupSort - rightGroupSort;
        }
        const leftParentRank = left.parentId == null ? 0 : 1;
        const rightParentRank = right.parentId == null ? 0 : 1;
        if (leftParentRank !== rightParentRank) {
          return leftParentRank - rightParentRank;
        }
        if ((left.parentId ?? 0) !== (right.parentId ?? 0)) {
          return (left.parentId ?? 0) - (right.parentId ?? 0);
        }
        if (left.sortIndex !== right.sortIndex) {
          return left.sortIndex - right.sortIndex;
        }
        return left.id - right.id;
      }
    }
  });
  return sorted;
};

const buildBuckets = (
  items: TodoQueryItem[],
  groupBy: TodoQueryRequest["groupBy"],
  groupMap: Map<number, TodoGroup>
) => {
  const bucketMap = new Map<string, TodoQueryBucket>();

  items.forEach(item => {
    let bucket: { key: string; label: string };
    switch (groupBy) {
      case "group": {
        const group = groupMap.get(item.groupId);
        bucket = {
          key: `group:${item.groupId}`,
          label: group?.title ?? `分组 ${item.groupId}`,
        };
        break;
      }
      case "status":
        bucket = getStatusBucket(item);
        break;
      case "type":
        bucket = {
          key: item.type,
          label:
            item.type === "deadline"
              ? "截止任务"
              : item.type === "planned"
                ? "计划任务"
                : item.type === "recurring"
                  ? "周期任务"
                  : "普通任务",
        };
        break;
      case "due_date":
        bucket = getDateBucket(item.dueAt);
        break;
      case "completion_date":
        bucket = getDateBucket(item.completedAt, "未完成");
        break;
      case "none":
      default:
        bucket = { key: "all", label: "全部结果" };
        break;
    }

    const existing = bucketMap.get(bucket.key) ?? {
      ...bucket,
      itemIds: [],
      totalCount: 0,
    };
    existing.itemIds.push(item.id);
    existing.totalCount += 1;
    bucketMap.set(bucket.key, existing);
  });

  return Array.from(bucketMap.values());
};

const loadBaseContext = async (filter?: TodoQueryFilter): Promise<TodoBaseContext> => {
  const [groups, systemGroups] = await Promise.all([listTodoGroups(), getSystemGroups()]);
  const allGroups = [...systemGroups, ...groups];

  let items: TodoItem[];
  if (filter?.groupIds && filter.groupIds.length > 0) {
    const groupItems = await Promise.all(
      [...new Set(filter.groupIds)].map(groupId => listTodoItems(groupId))
    );
    items = groupItems.flat();
  } else if (
    filter?.systemGroupTypes &&
    filter.systemGroupTypes.length > 0 &&
    !filter.systemGroupTypes.includes("all")
  ) {
    const itemsByType = await Promise.all(
      [...new Set(filter.systemGroupTypes)].map(type => listTodoItemsByType(type))
    );
    const deduped = new Map<number, TodoItem>();
    itemsByType.flat().forEach(item => deduped.set(item.id, item));
    items = Array.from(deduped.values());
  } else {
    items = await listTodoItemsByType("all");
  }

  return {
    groups: allGroups,
    groupMap: buildGroupMap(allGroups),
    items,
  };
};

const loadBatchRelations = async (items: TodoItem[]): Promise<TodoBatchRelations> => {
  const todoIds = [...new Set(items.map(item => item.id))];
  if (todoIds.length === 0) {
    return {
      notesByTodoId: {},
      calendarMappingsByTodoId: {},
      recurrencesByTodoId: {},
      recurrenceCompletionsByRecurrenceId: {},
    };
  }

  const [notesByTodoId, calendarMappingsByTodoId, recurrencesByTodoId] = await Promise.all([
    listTodoNotesByTodoIds(todoIds),
    getCalendarMappingsByTodoIds(todoIds),
    getRecurrencesByItemIds(todoIds),
  ]);

  const recurrences = Object.values(recurrencesByTodoId);
  const recurrenceIds = recurrences.map(recurrence => recurrence.id);
  const minStartDate = recurrences.reduce<number | undefined>((minValue, recurrence) => {
    if (minValue === undefined) {
      return recurrence.startDate;
    }
    return Math.min(minValue, recurrence.startDate);
  }, undefined);
  const recurrenceCompletionsByRecurrenceId = recurrenceIds.length
    ? await getRecurrenceCompletionsByRecurrenceIds(
        recurrenceIds,
        minStartDate,
        dayjs().endOf("day").valueOf()
      )
    : {};

  return {
    notesByTodoId,
    calendarMappingsByTodoId,
    recurrencesByTodoId,
    recurrenceCompletionsByRecurrenceId,
  };
};

const filterItems = async (context: TodoBaseContext, filter: TodoQueryFilter) => {
  const keyword = normalizeKeyword(filter.keyword);
  const parentChildrenMap = buildParentChildrenMap(context.items);
  const subtreeIds =
    typeof filter.parentId === "number" && filter.includeChildren
      ? collectDescendantIds(parentChildrenMap, filter.parentId)
      : null;
  const notesByTodoId = filter.keyword
    ? await listTodoNotesByTodoIds(context.items.map(item => item.id))
    : {};
  const groupNameSet = normalizeNameSet(filter.groupNames);

  const matchesKeyword = async (item: TodoItem) => {
    if (!keyword) {
      return true;
    }

    const group = context.groupMap.get(item.groupId);
    const descriptionText = normalizeDescendantsText(item.descriptionContent);
    const haystack = [item.title, descriptionText, group?.title ?? ""].join("\n").toLowerCase();
    if (haystack.includes(keyword)) {
      return true;
    }

    const cachedNotes = notesByTodoId[item.id] ?? [];
    return cachedNotes.some(note => (note.title ?? "").toLowerCase().includes(keyword));
  };

  const matched: TodoItem[] = [];
  const normalizedStart = normalizeTimeBoundary(filter.start, "start");
  const normalizedEnd = normalizeTimeBoundary(filter.end, "end");
  for (const item of context.items) {
    if (filter.groupIds?.length && !filter.groupIds.includes(item.groupId)) {
      continue;
    }

    if (groupNameSet.size > 0) {
      const groupTitle = context.groupMap.get(item.groupId)?.title?.trim().toLowerCase();
      if (!groupTitle || !groupNameSet.has(groupTitle)) {
        continue;
      }
    }

    if (
      filter.systemGroupTypes?.length &&
      !filter.systemGroupTypes.includes("all") &&
      !filter.systemGroupTypes.includes(item.type)
    ) {
      continue;
    }

    if (filter.todoIds?.length && !filter.todoIds.includes(item.id)) {
      continue;
    }

    if (filter.types?.length && !filter.types.includes(item.type)) {
      continue;
    }

    if (typeof filter.isCompleted === "boolean" && item.isCompleted !== filter.isCompleted) {
      continue;
    }

    if (typeof filter.isArchived === "boolean" && item.isArchived !== filter.isArchived) {
      continue;
    }

    if (typeof filter.isOverdue === "boolean" && isOverdueItem(item) !== filter.isOverdue) {
      continue;
    }

    if (typeof filter.hasDueAt === "boolean" && Boolean(item.dueAt) !== filter.hasDueAt) {
      continue;
    }

    if (typeof filter.hasStartAt === "boolean" && Boolean(item.startAt) !== filter.hasStartAt) {
      continue;
    }

    if (filter.rootOnly && item.parentId !== null) {
      continue;
    }

    if (filter.parentId !== undefined) {
      if (subtreeIds) {
        if (!subtreeIds.has(item.id)) {
          continue;
        }
      } else if (item.parentId !== filter.parentId) {
        continue;
      }
    }

    if (filter.timeField && (normalizedStart != null || normalizedEnd != null)) {
      const fieldValue = getItemFieldValue(item, filter);
      if (fieldValue == null) {
        continue;
      }
      if (normalizedStart != null && fieldValue < normalizedStart) {
        continue;
      }
      if (normalizedEnd != null && fieldValue > normalizedEnd) {
        continue;
      }
    }

    if (!(await matchesKeyword(item))) {
      continue;
    }

    matched.push(item);
  }

  return { matched, notesByTodoId };
};

const buildSummary = (items: TodoItem[], groupMap: Map<number, TodoGroup>): TodoQuerySummary => {
  const completedItems = items.filter(item => item.isCompleted);
  const pendingItems = items.filter(item => !item.isCompleted);
  const overdueItems = pendingItems.filter(isOverdueItem);

  return {
    totalCount: items.length,
    completedCount: completedItems.length,
    pendingCount: pendingItems.length,
    overdueCount: overdueItems.length,
    groupsCount: new Set(items.map(item => item.groupId)).size,
    recentCompleted: [...completedItems]
      .filter(item => item.completedAt)
      .sort((left, right) => (right.completedAt ?? 0) - (left.completedAt ?? 0))
      .slice(0, 5)
      .map(item => ({
        id: item.id,
        title: item.title,
        groupId: item.groupId,
        groupTitle: groupMap.get(item.groupId)?.title,
        completedAt: item.completedAt!,
      })),
  };
};

const enrichItems = async (
  items: TodoItem[],
  groupMap: Map<number, TodoGroup>,
  relations?: TodoBatchRelations
) => {
  const batchRelations = relations ?? (await loadBatchRelations(items));
  return items.map(item => {
    const recurrence = batchRelations.recurrencesByTodoId[item.id] ?? null;
    const notes = batchRelations.notesByTodoId[item.id] ?? [];
    const calendarMappings = batchRelations.calendarMappingsByTodoId[item.id] ?? [];
    const recurrenceCompletions = recurrence
      ? (batchRelations.recurrenceCompletionsByRecurrenceId[recurrence.id] ?? [])
      : [];

    const enrichedItem: TodoQueryItem = {
      ...item,
      group: groupMap.get(item.groupId),
      noteCount: notes.length,
      notes,
      recurrence,
      recurrenceCompletions,
      calendarMappings,
      descriptionMarkdown: item.descriptionContent ? getMarkdown(item.descriptionContent) : "",
    };

    return enrichedItem;
  });
};

export const executeTodoQuery = async (
  request: TodoQueryRequest = {}
): Promise<TodoQueryResponse> => {
  const filter = request.filter ?? {};
  const groupBy = request.groupBy ?? "group";
  const sort = request.sort ?? "manual";
  const page = normalizePage(request.page, DEFAULT_PAGE);
  const pageSize = Math.min(normalizePage(request.pageSize, DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
  const context = await loadBaseContext(filter);
  const { matched, notesByTodoId } = await filterItems(context, filter);
  const sorted = sortItems(matched, context.groupMap, sort);
  const summary = buildSummary(sorted, context.groupMap);
  const total = sorted.length;
  const totalPages = total > 0 ? Math.ceil(total / pageSize) : 1;
  const pageIndex = Math.min(page, totalPages);
  const startIndex = (pageIndex - 1) * pageSize;
  const pageItems = sorted.slice(startIndex, startIndex + pageSize);
  const relations = await loadBatchRelations(pageItems);
  relations.notesByTodoId = {
    ...relations.notesByTodoId,
    ...notesByTodoId,
  };
  const enrichedItems = await enrichItems(pageItems, context.groupMap, relations);

  return {
    type: "todo-query-result",
    query: {
      filter,
      groupBy,
      sort,
      page: pageIndex,
      pageSize,
    },
    summary,
    items: enrichedItems,
    groups: buildBuckets(enrichedItems, groupBy, context.groupMap),
    page: pageIndex,
    pageSize,
    total,
    totalPages,
    render: {
      layout: "todo-list",
      groupBy,
      sort,
    },
  };
};

const buildDashboardGroups = (items: TodoItem[], groups: TodoGroup[]) => {
  const itemMap = new Map<number, TodoItem[]>();
  items.forEach(item => {
    const bucket = itemMap.get(item.groupId) ?? [];
    bucket.push(item);
    itemMap.set(item.groupId, bucket);
  });

  return groups
    .map(group => {
      const groupItems = itemMap.get(group.id) ?? [];
      return {
        id: group.id,
        title: group.title,
        color: group.color,
        total: groupItems.length,
        pending: groupItems.filter(item => !item.isCompleted).length,
        overdue: groupItems.filter(isOverdueItem).length,
      };
    })
    .filter(group => group.total > 0)
    .sort((left, right) => right.pending - left.pending || right.total - left.total);
};

export const getTodoDashboardData = async (): Promise<TodoDashboardResponse> => {
  const context = await loadBaseContext({ systemGroupTypes: ["all"] });
  const items = sortItems(context.items, context.groupMap, "manual");
  const summary = buildSummary(items, context.groupMap);
  const dashboardCandidates = [
    ...items.filter(isOverdueItem).slice(0, 8),
    ...items
      .filter(item => !item.isCompleted)
      .sort((left, right) => {
        const leftDue = left.dueAt ?? Number.MAX_SAFE_INTEGER;
        const rightDue = right.dueAt ?? Number.MAX_SAFE_INTEGER;
        if (leftDue !== rightDue) {
          return leftDue - rightDue;
        }
        return right.updateTime - left.updateTime;
      })
      .slice(0, 12),
    ...items
      .filter(item => item.isCompleted && item.completedAt)
      .sort((left, right) => (right.completedAt ?? 0) - (left.completedAt ?? 0))
      .slice(0, 8),
  ];
  const dashboardRelations = await loadBatchRelations(dashboardCandidates);

  const enrichedAllItems = await enrichItems(
    items.filter(item => !item.isArchived),
    context.groupMap,
    dashboardRelations
  );
  const overdueItems = await enrichItems(
    items.filter(isOverdueItem).slice(0, 8),
    context.groupMap,
    dashboardRelations
  );
  const pendingItems = await enrichItems(
    items
      .filter(item => !item.isCompleted)
      .sort((left, right) => {
        const leftDue = left.dueAt ?? Number.MAX_SAFE_INTEGER;
        const rightDue = right.dueAt ?? Number.MAX_SAFE_INTEGER;
        if (leftDue !== rightDue) {
          return leftDue - rightDue;
        }
        return right.updateTime - left.updateTime;
      })
      .slice(0, 12),
    context.groupMap,
    dashboardRelations
  );
  const recentCompletedItems = await enrichItems(
    items
      .filter(item => item.isCompleted && item.completedAt)
      .sort((left, right) => (right.completedAt ?? 0) - (left.completedAt ?? 0))
      .slice(0, 8),
    context.groupMap,
    dashboardRelations
  );

  return {
    type: "todo-dashboard",
    generatedAt: Date.now(),
    summary,
    items: enrichedAllItems,
    groupBuckets: buildBuckets(enrichedAllItems, "group", context.groupMap),
    overdueItems,
    pendingItems,
    recentCompletedItems,
    groups: buildDashboardGroups(
      items.filter(item => !item.isArchived),
      context.groups.filter(group => !group.isSystem)
    ),
  };
};

export const isTodoQueryResponse = (value: unknown): value is TodoQueryResponse => {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as TodoQueryResponse).type === "todo-query-result"
  );
};

export const isTodoDashboardResponse = (value: unknown): value is TodoDashboardResponse => {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as TodoDashboardResponse).type === "todo-dashboard"
  );
};

export const buildDefaultTodoQuery = (systemGroupType?: TodoSystemGroupType): TodoQueryRequest => {
  return {
    filter:
      systemGroupType && systemGroupType !== "all"
        ? { systemGroupTypes: [systemGroupType] }
        : { systemGroupTypes: ["all"] },
    groupBy: "group",
    sort: "manual",
    page: DEFAULT_PAGE,
    pageSize: DEFAULT_PAGE_SIZE,
  };
};
