import type { CalendarMutationEvent } from "@/types";

const CALENDAR_MUTATION_EVENT = "calendar-mutation";

const calendarMutationEventTarget = new EventTarget();
const LOCAL_CALENDAR_CLIENT_ID = `calendar-client-${Math.random().toString(36).slice(2, 10)}`;

const dispatchCalendarMutationEvent = (event: CalendarMutationEvent) => {
  calendarMutationEventTarget.dispatchEvent(
    new CustomEvent<CalendarMutationEvent>(CALENDAR_MUTATION_EVENT, {
      detail: event,
    }),
  );
};

export const emitCalendarMutationEvent = (
  payload: Omit<CalendarMutationEvent, "timestamp"> & {
    timestamp?: number;
  },
) => {
  const event: CalendarMutationEvent = {
    ...payload,
    clientId: payload.clientId ?? LOCAL_CALENDAR_CLIENT_ID,
    timestamp: payload.timestamp ?? Date.now(),
  };

  dispatchCalendarMutationEvent(event);
  return event;
};

export const subscribeCalendarMutationEvent = (
  listener: (event: CalendarMutationEvent) => void,
) => {
  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<CalendarMutationEvent>;
    listener(customEvent.detail);
  };

  calendarMutationEventTarget.addEventListener(
    CALENDAR_MUTATION_EVENT,
    handler,
  );

  return () => {
    calendarMutationEventTarget.removeEventListener(
      CALENDAR_MUTATION_EVENT,
      handler,
    );
  };
};
