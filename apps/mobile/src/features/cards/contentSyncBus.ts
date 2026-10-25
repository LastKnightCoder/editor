import type { Descendant } from "slate";
import type { ContentDetailResponse } from "../../types";

type ContentUpdatedPayload = {
  contentId: number;
  content: Descendant[];
  sourceId: string;
  updateTime?: number;
  count?: number;
  document?: ContentDetailResponse;
};

const EVENT_NAME = "mobile-content-updated";
const eventTarget = new EventTarget();

export function createContentSyncSourceId(): string {
  return `mobile-content-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function publishContentUpdate(payload: ContentUpdatedPayload): void {
  eventTarget.dispatchEvent(
    new CustomEvent<ContentUpdatedPayload>(EVENT_NAME, {
      detail: payload,
    })
  );
}

export function subscribeContentUpdate(
  contentId: number,
  sourceId: string,
  onUpdate: (content: Descendant[], document?: ContentDetailResponse) => void
): () => void {
  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<ContentUpdatedPayload>;
    const payload = customEvent.detail;
    if (!payload) return;
    if (payload.contentId !== contentId) return;
    if (payload.sourceId === sourceId) return;
    onUpdate(payload.content, payload.document);
  };

  eventTarget.addEventListener(EVENT_NAME, handler as EventListener);
  return () => {
    eventTarget.removeEventListener(EVENT_NAME, handler as EventListener);
  };
}

export function subscribeContentUpdateAll(
  onUpdate: (payload: ContentUpdatedPayload) => void
): () => void {
  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<ContentUpdatedPayload>;
    const payload = customEvent.detail;
    if (!payload) return;
    onUpdate(payload);
  };

  eventTarget.addEventListener(EVENT_NAME, handler as EventListener);
  return () => {
    eventTarget.removeEventListener(EVENT_NAME, handler as EventListener);
  };
}
