import { Descendant, Editor } from "slate";
import type { Plugin } from "../utils/plugin";

/**
 * 宿主注入的导入函数的第三个参数。编辑器内核不依赖 @tau/markdown（它反过来依赖编辑器的元素类型），
 * 这里只声明结构，与 @tau/markdown 的 ImportFromMarkdownOptions 结构兼容。
 */
export interface ImportFromMarkdownOptions {
  customDirectives?: Record<
    string,
    (attributes: Record<string, string | undefined>) => Descendant | null
  >;
}

/** 粗判一段纯文本是否像 Markdown：粘贴时决定要不要交给宿主的导入函数 */
export const isMarkdownLikeText = (text: string): boolean => {
  if (!text.trim()) return false;

  const markdownPatterns = [
    /^\s{0,3}#{1,6}\s+/m,
    /^\s*[-*+]\s+/m,
    /^\s*\d+\.\s+/m,
    /^\s*>\s+/m,
    /(^|\n)\s*(```|~~~)/,
    /!\[[^\]]*\]\([^)]+\)/,
    /\[[^\]]+\]\([^)]+\)/,
    /(^|\n)\s*:::[^\n]*/m,
    /(^|\n)\s*::[a-zA-Z-]+(?:\{|\s|$)/m,
    /(^|\n)\s*:[a-zA-Z-]+\[/m,
  ];

  if (markdownPatterns.some(pattern => pattern.test(text))) {
    return true;
  }

  const hasTableRow = /^\s*\|.*\|\s*$/m.test(text);
  const hasTableDivider = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/m.test(text);

  return hasTableRow && hasTableDivider;
};

const SLATE_FRAGMENT_MIME = "application/x-slate-fragment";
const MARKDOWN_MIME = "text/markdown";
const HTML_MIME = "text/html";
const PLAIN_TEXT_MIME = "text/plain";

const hasSlateFragmentHtml = (html: string): boolean => {
  return html.includes("data-slate-fragment=");
};

const hasMediaClipboardItems = (data: DataTransfer): boolean => {
  if (data.files?.length) {
    return Array.from(data.files).some(file => {
      const [mime] = file.type.split("/");
      return mime === "image" || mime === "video" || mime === "audio";
    });
  }

  if (!data.items) return false;

  return Array.from(data.items).some(item => {
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
    keys.every(key => key === "type" || key === "text")
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

/**
 * markdown 粘贴导入插件（宿主 opt-in）：
 * 经 createMarkdownPasteImportExtension 注入宿主的 importFromMarkdown
 * （可携带业务 customDirectives），内核默认不启用。
 */
export const createMarkdownPasteImportPlugin =
  (
    importFromMarkdown: (
      markdown: string,
      ignoreTypes?: string[],
      options?: ImportFromMarkdownOptions
    ) => Descendant[]
  ): Plugin =>
  (editor: Editor) => {
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

      const shouldTreatAsMarkdown = Boolean(markdownText?.trim()) || isMarkdownLikeText(sourceText);

      if (!shouldTreatAsMarkdown) {
        insertData(data);
        return;
      }

      try {
        const imported = importFromMarkdown(sourceText);
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
