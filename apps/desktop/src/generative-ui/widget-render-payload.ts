import {
  DEFAULT_WIDGET_LOADING_MESSAGES,
  GENERATIVE_WIDGET_RENDERER_KEY,
} from "./constants";

export type WidgetRenderPhase =
  | "pending"
  | "streaming"
  | "preview"
  | "final"
  | "error";

export type GenerativeWidgetWarningCode = "widget_arguments_incomplete";

export interface GenerativeWidgetRenderPayload {
  toolCallId: string;
  title: string;
  loadingMessages: string[];
  previewHtml: string;
  finalHtml: string;
  visualSignature: string;
  phase: WidgetRenderPhase;
  isStreaming: boolean;
  hasScripts: boolean;
  warningCodes?: GenerativeWidgetWarningCode[];
}

export interface ShowWidgetArgsLike {
  title?: string;
  loading_messages?: string[];
  widget_code?: string;
}

const COMPLETE_SCRIPT_TAG = /<script\b[^>]*>[\s\S]*?<\/script>/gi;
const EVENT_ATTR = /\son[a-z-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;

const truncateDanglingTag = (html: string, tagName: string) => {
  const openTag = `<${tagName}`;
  const closeTag = `</${tagName}>`;
  const lastOpenIndex = html.toLowerCase().lastIndexOf(openTag);
  const lastCloseIndex = html.toLowerCase().lastIndexOf(closeTag);
  if (lastOpenIndex >= 0 && lastOpenIndex > lastCloseIndex) {
    return html.slice(0, lastOpenIndex);
  }
  return html;
};

export const sanitizeWidgetPreviewHtml = (html: string): string => {
  if (!html) {
    return "";
  }

  let sanitized = html.replace(COMPLETE_SCRIPT_TAG, "");
  sanitized = truncateDanglingTag(sanitized, "script");
  sanitized = truncateDanglingTag(sanitized, "style");
  sanitized = sanitized.replace(EVENT_ATTR, "");
  return sanitized.trim();
};

export const normalizeWidgetVisualHtml = (html: string): string => {
  if (!html) {
    return "";
  }
  return sanitizeWidgetPreviewHtml(html)
    .replace(/\s+/g, " ")
    .replace(/>\s+</g, "><")
    .trim();
};

export const hasWidgetScripts = (html: string): boolean =>
  /<script\b/i.test(html);

export const buildGenerativeWidgetPayload = ({
  toolCallId,
  title,
  loadingMessages,
  widgetCode,
  phase,
  warningCodes,
}: {
  toolCallId: string;
  title?: string;
  loadingMessages?: string[];
  widgetCode?: string;
  phase: WidgetRenderPhase;
  warningCodes?: GenerativeWidgetWarningCode[];
}): GenerativeWidgetRenderPayload => {
  const finalHtml = widgetCode?.trim() || "";
  const previewHtml = sanitizeWidgetPreviewHtml(finalHtml);

  return {
    toolCallId,
    title: title?.trim() || "Widget",
    loadingMessages:
      loadingMessages && loadingMessages.length > 0
        ? loadingMessages
        : DEFAULT_WIDGET_LOADING_MESSAGES,
    previewHtml,
    finalHtml,
    visualSignature: normalizeWidgetVisualHtml(finalHtml),
    phase,
    isStreaming: phase === "pending" || phase === "streaming",
    hasScripts: hasWidgetScripts(finalHtml),
    warningCodes,
  };
};

export const buildGenerativeWidgetMetadata = (
  payload: GenerativeWidgetRenderPayload,
) => ({
  render: {
    rendererKey: GENERATIVE_WIDGET_RENDERER_KEY,
    payload,
  },
});
