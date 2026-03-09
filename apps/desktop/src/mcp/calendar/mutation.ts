import type {
  CalendarMutationEntityType,
  CalendarMutationEvent,
} from "@/types";
import { emitCalendarMutationEvent } from "./events";

export const CALENDAR_MUTATION_ACTIONS = {
  CREATE_GROUP: "create-group",
  UPDATE_GROUP: "update-group",
  DELETE_GROUP: "delete-group",
  CREATE_CALENDAR: "create-calendar",
  UPDATE_CALENDAR: "update-calendar",
  ARCHIVE_CALENDAR: "archive-calendar",
  UNARCHIVE_CALENDAR: "unarchive-calendar",
  TOGGLE_CALENDAR_VISIBILITY: "toggle-calendar-visibility",
  DELETE_CALENDAR: "delete-calendar",
  MERGE_CALENDARS: "merge-calendars",
  CREATE_EVENT: "create-event",
  UPDATE_EVENT: "update-event",
  DELETE_EVENT: "delete-event",
} as const;

export type CalendarMutationAction =
  (typeof CALENDAR_MUTATION_ACTIONS)[keyof typeof CALENDAR_MUTATION_ACTIONS];

export const createCalendarMutationPayload = (params: {
  source: string;
  entityType: CalendarMutationEntityType;
  entityId?: number;
  groupId?: number | null;
  previousGroupId?: number | null;
  calendarId?: number | null;
  previousCalendarId?: number | null;
  action: CalendarMutationAction;
  changedFields?: string[];
  clientId?: string;
}) => params;

export const emitCalendarMutation = (params: {
  source: string;
  entityType: CalendarMutationEntityType;
  entityId?: number;
  groupId?: number | null;
  previousGroupId?: number | null;
  calendarId?: number | null;
  previousCalendarId?: number | null;
  action: CalendarMutationAction;
  changedFields?: string[];
  clientId?: string;
}) => {
  return emitCalendarMutationEvent(createCalendarMutationPayload(params));
};

export const shouldRefreshCalendarResult = (params: {
  event: CalendarMutationEvent;
  toolName: string;
  parsedInput?: Record<string, unknown> | null;
  payloadKind?: string;
  payloadEntityType?: string;
  payloadId?: number | null;
}) => {
  const {
    event,
    toolName,
    parsedInput,
    payloadKind,
    payloadEntityType,
    payloadId,
  } = params;

  if (toolName === "get_calendar_dashboard") {
    return true;
  }

  if (
    payloadKind === "calendar-detail" &&
    payloadEntityType === "calendar" &&
    payloadId != null
  ) {
    return (
      (event.entityType === "calendar" && event.entityId === payloadId) ||
      (event.entityType === "calendar-event" &&
        (event.calendarId === payloadId ||
          event.previousCalendarId === payloadId))
    );
  }

  if (
    payloadKind === "calendar-group-detail" &&
    payloadEntityType === "calendar-group" &&
    payloadId != null
  ) {
    return (
      (event.entityType === "calendar-group" && event.entityId === payloadId) ||
      event.groupId === payloadId ||
      event.previousGroupId === payloadId
    );
  }

  if (
    payloadKind === "calendar-event-detail" &&
    payloadEntityType === "calendar-event" &&
    payloadId != null
  ) {
    return (
      (event.entityType === "calendar-event" && event.entityId === payloadId) ||
      (event.calendarId != null &&
        parsedInput?.id != null &&
        Number(parsedInput.id) === payloadId)
    );
  }

  if (toolName === "query_calendar_groups") {
    return (
      event.entityType === "calendar-group" || event.entityType === "calendar"
    );
  }

  if (toolName === "query_calendars") {
    return (
      event.entityType === "calendar" ||
      event.entityType === "calendar-group" ||
      event.entityType === "calendar-event"
    );
  }

  if (
    toolName === "query_calendar_events" ||
    toolName === "get_events_by_dates" ||
    toolName === "get_events_by_date_range"
  ) {
    const calendarIds = Array.isArray(parsedInput?.calendarIds)
      ? (parsedInput?.calendarIds as number[])
      : null;

    if (!calendarIds?.length) {
      return true;
    }

    return event.calendarId != null && calendarIds.includes(event.calendarId);
  }

  return true;
};
