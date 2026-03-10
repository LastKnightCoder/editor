import { useBackendWebsocketStore } from "@/stores/useBackendWebsocketStore";
import type { QuestionMutationEvent } from "./mutation";

const QUESTION_MUTATION_EVENT = "question-mutation";
const QUESTION_MUTATION_NOTIFICATION = "question:mutation";
const QUESTION_MUTATION_BROADCAST_REQUEST = "question:broadcast-mutation";

const questionMutationEventTarget = new EventTarget();
const LOCAL_QUESTION_CLIENT_ID = `question-client-${Math.random().toString(36).slice(2, 10)}`;

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

const dispatchQuestionMutationEvent = (event: QuestionMutationEvent) => {
  questionMutationEventTarget.dispatchEvent(
    new CustomEvent<QuestionMutationEvent>(QUESTION_MUTATION_EVENT, {
      detail: event,
    }),
  );
};

const handleQuestionMutationNotification = (payload: unknown) => {
  if (!payload || typeof payload !== "object") {
    return;
  }

  const event = payload as QuestionMutationEvent;
  if (event.clientId === LOCAL_QUESTION_CLIENT_ID) {
    return;
  }

  dispatchQuestionMutationEvent(event);
};

const ensureQuestionMutationWebsocketBridge = () => {
  const client = useBackendWebsocketStore.getState().client;
  if (!client && !boundWebsocketClient) {
    return;
  }

  if (boundWebsocketClient === client) {
    return;
  }

  if (boundWebsocketClient) {
    boundWebsocketClient.unregisterNotificationHandler(
      QUESTION_MUTATION_NOTIFICATION,
      handleQuestionMutationNotification,
    );
    boundWebsocketClient = null;
  }

  if (!client) {
    return;
  }

  client.registerNotificationHandler(
    QUESTION_MUTATION_NOTIFICATION,
    handleQuestionMutationNotification,
  );
  boundWebsocketClient = client;
};

useBackendWebsocketStore.subscribe((state, prevState) => {
  if (state.client !== prevState.client) {
    ensureQuestionMutationWebsocketBridge();
  }
});

export const emitQuestionMutationEvent = (
  payload: Omit<QuestionMutationEvent, "timestamp"> & {
    timestamp?: number;
    broadcast?: boolean;
  },
) => {
  ensureQuestionMutationWebsocketBridge();

  const event: QuestionMutationEvent = {
    ...payload,
    clientId: payload.clientId ?? LOCAL_QUESTION_CLIENT_ID,
    timestamp: payload.timestamp ?? Date.now(),
  };

  dispatchQuestionMutationEvent(event);

  if (payload.broadcast !== false) {
    const store = useBackendWebsocketStore.getState();
    if (store.client) {
      void store
        .sendMessage(QUESTION_MUTATION_BROADCAST_REQUEST, event)
        .catch(() => undefined);
    }
  }

  return event;
};

export const subscribeQuestionMutationEvent = (
  listener: (event: QuestionMutationEvent) => void,
) => {
  ensureQuestionMutationWebsocketBridge();

  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<QuestionMutationEvent>;
    listener(customEvent.detail);
  };

  questionMutationEventTarget.addEventListener(
    QUESTION_MUTATION_EVENT,
    handler,
  );

  return () => {
    questionMutationEventTarget.removeEventListener(
      QUESTION_MUTATION_EVENT,
      handler,
    );
  };
};
