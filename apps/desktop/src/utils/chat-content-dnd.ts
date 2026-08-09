import type { MentionEntityType, MentionRef } from "@tau/shared";

export const CHAT_CONTENT_DND_TYPE = "chat-content-reference";
export const SIDEBAR_ITEM_DND_TYPE = "sidebar-item";

export interface ChatContentDragCarrier {
  chatContentReference?: MentionRef;
}

const MENTION_ENTITY_TYPES = new Set<MentionEntityType>([
  "card",
  "article",
  "project-item",
  "document-item",
]);

const isMentionRef = (value: unknown): value is MentionRef => {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<MentionRef>;
  return (
    MENTION_ENTITY_TYPES.has(candidate.entityType as MentionEntityType) &&
    typeof candidate.entityId === "number" &&
    candidate.entityId > 0 &&
    typeof candidate.contentId === "number" &&
    candidate.contentId > 0 &&
    typeof candidate.title === "string"
  );
};

export const getChatContentDragReference = (
  item: unknown,
): MentionRef | null => {
  if (isMentionRef(item)) return item;
  if (!item || typeof item !== "object") return null;

  const carrier = item as ChatContentDragCarrier;
  return isMentionRef(carrier.chatContentReference)
    ? carrier.chatContentReference
    : null;
};
