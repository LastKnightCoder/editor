import type {
  MentionEntityType,
  MentionRef,
} from "../components/ChatInputArea/types";

export interface MentionQueryMatch {
  query: string;
  start: number;
  end: number;
}

export const parseContentLinkAttributes = (rawAttributes: string) => {
  const attributes: Record<string, string> = {};
  const attrRegex = /(\w+)=(?:"([^"]*)"|(\S+))/g;
  let match: RegExpExecArray | null = null;

  while ((match = attrRegex.exec(rawAttributes)) !== null) {
    const [, key, quotedValue, plainValue] = match;
    const rawValue = quotedValue ?? plainValue ?? "";
    attributes[key] = rawValue.replace(/&quot;/g, '"');
  }

  return attributes;
};

const escapeDirectiveValue = (value: string) => value.replace(/"/g, "&quot;");

export const serializeMentionRef = (mention: MentionRef) => {
  const title = mention.title || "未命名引用";
  return `:content-link[${title}]{refId=${mention.entityId} contentId=${mention.contentId} contentType=${mention.entityType} title="${escapeDirectiveValue(title)}" previewText="${escapeDirectiveValue(mention.previewText || "")}"}`;
};

export const extractMentionRefsFromText = (text: string): MentionRef[] => {
  const regex = /:content-link\[([^\]]+)\]\{([^}]+)\}/g;
  const mentions: MentionRef[] = [];
  let match: RegExpExecArray | null = null;

  while ((match = regex.exec(text)) !== null) {
    const [, displayText, rawAttributes] = match;
    const attributes = parseContentLinkAttributes(rawAttributes);
    const entityType = attributes.contentType as MentionEntityType | undefined;
    const entityId = Number.parseInt(attributes.refId || "0", 10);
    const contentId = Number.parseInt(attributes.contentId || "0", 10);

    if (!entityType || !entityId || !contentId) {
      continue;
    }

    mentions.push({
      entityType,
      entityId,
      contentId,
      title: attributes.title || displayText,
      previewText: attributes.previewText || "",
    });
  }

  return mentions;
};

export const findActiveMentionQuery = (
  text: string,
  cursor: number,
): MentionQueryMatch | null => {
  const safeCursor = Math.max(0, Math.min(cursor, text.length));
  const beforeCursor = text.slice(0, safeCursor);
  const match = /(^|[\s\n])@([^\s@]*)$/.exec(beforeCursor);

  if (!match) {
    return null;
  }

  const leading = match[1] || "";
  const query = match[2] || "";
  const start = safeCursor - match[0].length + leading.length;

  return {
    query,
    start,
    end: safeCursor,
  };
};
