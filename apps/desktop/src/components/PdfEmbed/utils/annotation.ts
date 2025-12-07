import type { PdfAnnotationObject } from "@embedpdf/models";

const getCustomText = (annotation?: PdfAnnotationObject): string | null => {
  if (!annotation) return null;
  const customPayload = annotation.custom;
  if (
    customPayload &&
    typeof customPayload === "object" &&
    "text" in customPayload
  ) {
    const textValue = (customPayload as { text?: unknown }).text;
    if (typeof textValue === "string") {
      const trimmed = textValue.trim();
      return trimmed.length ? trimmed : null;
    }
  }
  return null;
};

export const extractAnnotationText = (
  annotation?: PdfAnnotationObject,
): string => {
  if (!annotation) return "";
  const customText = getCustomText(annotation);
  if (customText) {
    return customText;
  }
  const contents = annotation.contents?.trim();
  return contents && contents.length ? contents : "";
};

export const formatAnnotationSnippet = (
  annotation?: PdfAnnotationObject,
  fallbackPage = true,
): string => {
  const text = extractAnnotationText(annotation);
  if (text) {
    return text;
  }
  if (!fallbackPage || !annotation) return "";
  const pageText = (annotation.pageIndex ?? 0) + 1;
  return `第 ${pageText} 页标注`;
};
