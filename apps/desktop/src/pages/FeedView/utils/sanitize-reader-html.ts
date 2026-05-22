import DOMPurify from "dompurify";

const ALLOWED_URI_REGEXP =
  /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i;

export const sanitizeReaderHtml = (html: string | null | undefined): string => {
  if (!html) {
    return "<p>暂无内容</p>";
  }

  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ALLOWED_URI_REGEXP,
    FORBID_TAGS: [
      "script",
      "style",
      "iframe",
      "object",
      "embed",
      "form",
      "input",
      "button",
      "textarea",
      "select",
    ],
    FORBID_ATTR: ["srcdoc"],
  });
};
