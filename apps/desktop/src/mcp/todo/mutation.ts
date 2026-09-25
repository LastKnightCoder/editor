import type {
  TodoMutationEntityType,
  TodoMutationEvent,
  TodoQueryRequest,
  TodoQueryResponse,
  TodoSystemGroupType,
} from "@/types";
import { emitTodoMutationEvent } from "@/mcp/todo/events";

export const TODO_MUTATION_ACTIONS = {
  CREATE_GROUP: "create-group",
  UPDATE_GROUP: "update-group",
  ARCHIVE_GROUP: "archive-group",
  UNARCHIVE_GROUP: "unarchive-group",
  DELETE_GROUP: "delete-group",
  REORDER_GROUPS: "reorder-groups",
  CREATE_ITEM: "create-item",
  CREATE_ITEM_ABOVE: "create-item-above",
  CREATE_ITEM_BELOW: "create-item-below",
  CREATE_ITEM_CHILD: "create-item-child",
  UPDATE_ITEM: "update-item",
  COMPLETE_ITEM: "complete-item",
  UNCOMPLETE_ITEM: "uncomplete-item",
  MOVE_ITEM: "move-item",
  ARCHIVE_ITEM: "archive-item",
  UNARCHIVE_ITEM: "unarchive-item",
  DELETE_ITEM: "delete-item",
  DELETE_ITEM_CASCADE: "delete-item-cascade",
  CREATE_RECURRENCE: "create-recurrence",
  UPDATE_RECURRENCE: "update-recurrence",
  DELETE_RECURRENCE: "delete-recurrence",
  COMPLETE_OCCURRENCE: "complete-occurrence",
  UNCOMPLETE_OCCURRENCE: "uncomplete-occurrence",
  SKIP_OCCURRENCE: "skip-occurrence",
  ATTACH_NOTE: "attach-note",
  CREATE_AND_ATTACH_NOTE: "create-and-attach-note",
  DETACH_NOTE: "detach-note",
  REORDER_NOTES: "reorder-notes",
  UPDATE_NOTE_TITLE_SNAPSHOT: "update-note-title-snapshot",
  CREATE_CALENDAR_MAPPING: "create-calendar-mapping",
  DELETE_CALENDAR_MAPPING: "delete-calendar-mapping",
  DELETE_CALENDAR_MAPPINGS_BY_TODO: "delete-calendar-mappings-by-todo",
  SYNC_ITEM_TO_CALENDAR: "sync-item-to-calendar",
  REMOVE_ITEM_FROM_CALENDAR: "remove-item-from-calendar",
} as const;

export type TodoMutationAction = (typeof TODO_MUTATION_ACTIONS)[keyof typeof TODO_MUTATION_ACTIONS];

export const createTodoMutationPayload = (params: {
  source: string;
  entityType: TodoMutationEntityType;
  entityId?: number;
  groupId?: number | null;
  relatedItemId?: number | null;
  action: TodoMutationAction;
  changedFields?: string[];
  clientId?: string;
}) => params;

export const emitTodoMutation = (params: {
  source: string;
  entityType: TodoMutationEntityType;
  entityId?: number;
  groupId?: number | null;
  relatedItemId?: number | null;
  action: TodoMutationAction;
  changedFields?: string[];
  clientId?: string;
}) => {
  return emitTodoMutationEvent(createTodoMutationPayload(params));
};

const getEventItemId = (event: TodoMutationEvent) =>
  event.entityType === "item" ? event.entityId : event.relatedItemId;

export const doesTodoEventAffectTodo = (
  event: TodoMutationEvent,
  todoId: number | null | undefined
) => {
  if (!todoId) {
    return false;
  }

  return getEventItemId(event) === todoId;
};

export const doesTodoEventAffectGroup = (
  event: TodoMutationEvent,
  groupId: number | null | undefined,
  activeSystemType?: TodoSystemGroupType
) => {
  if (activeSystemType) {
    return (
      event.entityType === "item" ||
      event.entityType === "recurrence" ||
      event.entityType === "calendar-mapping" ||
      event.entityType === "note-link" ||
      event.entityType === "group"
    );
  }

  if (!groupId) {
    return false;
  }

  if (event.entityType === "group") {
    return event.groupId === groupId || event.action === TODO_MUTATION_ACTIONS.REORDER_GROUPS;
  }

  return event.groupId === groupId;
};

export const shouldRefreshTodoQueryResult = (params: {
  event: TodoMutationEvent;
  query: TodoQueryRequest | null | undefined;
  currentResult: TodoQueryResponse | null;
}) => {
  const { event, query, currentResult } = params;
  if (!currentResult) {
    return true;
  }

  const filter = query?.filter;
  const currentItemIds = new Set(currentResult.items.map(item => item.id));
  const currentGroupIds = new Set(currentResult.items.map(item => item.groupId));

  if (event.entityType === "group") {
    if (event.action === TODO_MUTATION_ACTIONS.REORDER_GROUPS) {
      return true;
    }

    if (event.groupId && currentGroupIds.has(event.groupId)) {
      return true;
    }

    if (filter?.groupIds?.length) {
      return Boolean(event.groupId && filter.groupIds.includes(event.groupId));
    }

    return false;
  }

  const eventItemId = getEventItemId(event);
  if (eventItemId && currentItemIds.has(eventItemId)) {
    return true;
  }

  if (filter?.todoIds?.length) {
    return Boolean(eventItemId && filter.todoIds.includes(eventItemId));
  }

  if (filter?.groupIds?.length) {
    return Boolean(event.groupId && filter.groupIds.includes(event.groupId));
  }

  if (currentGroupIds.size > 0 && event.groupId && currentGroupIds.has(event.groupId)) {
    return true;
  }

  if (filter?.systemGroupTypes?.length && !filter.systemGroupTypes.includes("all")) {
    return true;
  }

  if (filter?.keyword || filter?.timeField || filter?.types?.length) {
    return true;
  }

  return true;
};
