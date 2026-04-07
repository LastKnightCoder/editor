export interface PdfCitationTarget {
  pageNumber: number;
  charStart?: number;
  charEnd?: number;
  previewText?: string;
  label?: string;
}

const PDF_CITATION_DIRECTIVE_NAME = "pdfref";
const PDF_CITATION_LABEL_PATTERN =
  /^\[?\s*第\s*(\d+)\s*页(?:\s*[｜|丨]\s*(.+?))?\s*\]?$/;

const normalizePreviewText = (text: string, maxLength = 80) =>
  text.replace(/\s+/g, " ").trim().slice(0, maxLength);

export const buildPdfCitationMarkerLabel = (
  target: PdfCitationTarget,
): string => `[${target.pageNumber}]`;

const buildPdfCitationAttributeString = (target: PdfCitationTarget): string => {
  const attributes = [`page=${target.pageNumber}`];
  if (typeof target.charStart === "number") {
    attributes.push(`charStart=${target.charStart}`);
  }
  if (typeof target.charEnd === "number") {
    attributes.push(`charEnd=${target.charEnd}`);
  }
  return attributes.join(" ");
};

export const parsePdfCitationLabel = (
  label?: string,
): PdfCitationTarget | null => {
  const normalizedLabel = String(label || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalizedLabel) {
    return null;
  }

  const match = normalizedLabel.match(PDF_CITATION_LABEL_PATTERN);
  if (!match) {
    return null;
  }

  const pageNumber = Number(match[1]);
  if (!Number.isFinite(pageNumber) || pageNumber <= 0) {
    return null;
  }

  return {
    pageNumber,
    previewText: match[2]?.trim(),
    label: normalizedLabel,
  };
};

export const buildPdfCitationMarkdown = (target: PdfCitationTarget): string => {
  const preview = normalizePreviewText(target.previewText || "");
  const safePreview = preview
    .replace(/\[/g, "（")
    .replace(/\]/g, "）")
    .replace(/\|/g, "¦");
  const label = safePreview
    ? `第${target.pageNumber}页｜${safePreview}`
    : `第${target.pageNumber}页`;
  return `:${PDF_CITATION_DIRECTIVE_NAME}[${label}]{${buildPdfCitationAttributeString(target)}}`;
};
