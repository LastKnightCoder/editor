import { Descendant, Editor } from "slate";
import { isMarkdownLikeText as defaultIsMarkdownLikeText } from "../utils/markdownImport";

const SLATE_FRAGMENT_MIME = "application/x-slate-fragment";
const MARKDOWN_MIME = "text/markdown";
const HTML_MIME = "text/html";
const PLAIN_TEXT_MIME = "text/plain";

const hasSlateFragmentHtml = (html: string): boolean => {
  return html.includes("data-slate-fragment=");
};

const hasMediaClipboardItems = (data: DataTransfer): boolean => {
  if (data.files?.length) {
    return Array.from(data.files).some((file) => {
      const [mime] = file.type.split("/");
      return mime === "image" || mime === "video" || mime === "audio";
    });
  }

  if (!data.items) return false;

  return Array.from(data.items).some((item) => {
    return (
      item.type.startsWith("image/") ||
      item.type.startsWith("video/") ||
      item.type.startsWith("audio/")
    );
  });
};

const isPlainFormattedLeaf = (node: unknown): boolean => {
  if (!node || typeof node !== "object") return false;
  const candidate = node as Record<string, unknown>;
  const keys = Object.keys(candidate);
  return (
    candidate.type === "formatted" &&
    typeof candidate.text === "string" &&
    keys.every((key) => key === "type" || key === "text")
  );
};

const isPlainParagraphNode = (node: unknown): boolean => {
  if (!node || typeof node !== "object") return false;
  const candidate = node as Record<string, unknown>;
  return (
    candidate.type === "paragraph" &&
    Array.isArray(candidate.children) &&
    candidate.children.every(isPlainFormattedLeaf)
  );
};

const isPlainParagraphContent = (nodes: Descendant[]): boolean => {
  return nodes.length > 0 && nodes.every(isPlainParagraphNode);
};

export const withMarkdownPasteImport = (editor: Editor) => {
  const { insertData } = editor;

  editor.insertData = async (data: DataTransfer) => {
    if (data.getData(SLATE_FRAGMENT_MIME)) {
      insertData(data);
      return;
    }

    const html = data.getData(HTML_MIME);
    if (html && hasSlateFragmentHtml(html)) {
      insertData(data);
      return;
    }

    if (hasMediaClipboardItems(data)) {
      insertData(data);
      return;
    }

    const markdownText = data.getData(MARKDOWN_MIME);
    const plainText = data.getData(PLAIN_TEXT_MIME);
    const sourceText = markdownText || plainText;

    if (!sourceText?.trim()) {
      insertData(data);
      return;
    }

    const utility = editor.services?.utility;
    const detectMarkdown =
      utility?.isMarkdownLikeText ?? defaultIsMarkdownLikeText;
    const shouldTreatAsMarkdown =
      Boolean(markdownText?.trim()) || detectMarkdown(sourceText);

    if (!shouldTreatAsMarkdown || !utility?.importFromMarkdown) {
      insertData(data);
      return;
    }

    try {
      const imported = utility.importFromMarkdown(sourceText);
      if (!imported.length) {
        insertData(data);
        return;
      }

      if (!markdownText && isPlainParagraphContent(imported)) {
        insertData(data);
        return;
      }

      editor.insertFragment(imported);
    } catch {
      insertData(data);
    }
  };

  return editor;
};
