import type { TodoMutationEvent } from "@/types";
import { useBackendWebsocketStore } from "@/stores/useBackendWebsocketStore";

const TODO_MUTATION_EVENT = "todo-mutation";
const TODO_MUTATION_NOTIFICATION = "todo:mutation";
const TODO_MUTATION_BROADCAST_REQUEST = "todo:broadcast-mutation";

const todoMutationEventTarget = new EventTarget();
const LOCAL_TODO_CLIENT_ID = `todo-client-${Math.random().toString(36).slice(2, 10)}`;
let boundWebsocketClient: {
  registerNotificationHandler: (
    method: string,
    handler: (data: unknown) => void,
  ) => void;
  unregisterNotificationHandler: (
    method: string,
    handler: (data: unknown) => void,
  ) => void;
} | null = null;

const handleTodoMutationNotification = (payload: unknown) => {
  if (!payload || typeof payload !== "object") {
    return;
  }

  const event = payload as TodoMutationEvent;
  if (event.clientId === LOCAL_TODO_CLIENT_ID) {
    return;
  }

  dispatchTodoMutationEvent(event);
};

const dispatchTodoMutationEvent = (event: TodoMutationEvent) => {
  todoMutationEventTarget.dispatchEvent(
    new CustomEvent<TodoMutationEvent>(TODO_MUTATION_EVENT, {
      detail: event,
    }),
  );
};

const ensureTodoMutationWebSocketBridge = () => {
  const client = useBackendWebsocketStore.getState().client;
  if (!client && !boundWebsocketClient) {
    return;
  }

  if (boundWebsocketClient === client) {
    return;
  }

  if (boundWebsocketClient) {
    boundWebsocketClient.unregisterNotificationHandler(
      TODO_MUTATION_NOTIFICATION,
      handleTodoMutationNotification,
    );
    boundWebsocketClient = null;
  }

  if (!client) {
    return;
  }

  client.registerNotificationHandler(
    TODO_MUTATION_NOTIFICATION,
    handleTodoMutationNotification,
  );

  boundWebsocketClient = client;
};

useBackendWebsocketStore.subscribe((state, prevState) => {
  if (state.client !== prevState.client) {
    ensureTodoMutationWebSocketBridge();
  }
});

export const emitTodoMutationEvent = (
  payload: Omit<TodoMutationEvent, "timestamp"> & {
    timestamp?: number;
    broadcast?: boolean;
  },
) => {
  ensureTodoMutationWebSocketBridge();

  const event: TodoMutationEvent = {
    ...payload,
    clientId: payload.clientId ?? LOCAL_TODO_CLIENT_ID,
    timestamp: payload.timestamp ?? Date.now(),
  };

  dispatchTodoMutationEvent(event);

  if (payload.broadcast !== false) {
    const store = useBackendWebsocketStore.getState();
    if (store.client) {
      void store
        .sendMessage(TODO_MUTATION_BROADCAST_REQUEST, event)
        .catch(() => undefined);
    }
  }

  return event;
};

export const subscribeTodoMutationEvent = (
  listener: (event: TodoMutationEvent) => void,
) => {
  ensureTodoMutationWebSocketBridge();

  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<TodoMutationEvent>;
    listener(customEvent.detail);
  };

  todoMutationEventTarget.addEventListener(TODO_MUTATION_EVENT, handler);

  return () => {
    todoMutationEventTarget.removeEventListener(TODO_MUTATION_EVENT, handler);
  };
};
