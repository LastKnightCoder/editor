import type { Descendant } from "slate";
import { htmlSerializerRegistry } from "@/utils/html-serializers";

/**
 * PDF 导出的基础样式
 * 复用 EPUB 导出的样式，确保一致性
 */
const PDF_BASE_STYLES = `
html, body {
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
  line-height: 1.75;
  color: #111;
  padding: 1.2em;
  max-width: 100%;
}

h1, h2, h3, h4, h5, h6 {
  line-height: 1.35;
  margin: 1.4em 0 0.7em;
  font-weight: 600;
}

h1 { font-size: 2em; }
h2 { font-size: 1.5em; }
h3 { font-size: 1.25em; }
h4 { font-size: 1.1em; }
h5 { font-size: 1em; }
h6 { font-size: 0.9em; }

p, ul, ol, blockquote, pre, table {
  margin: 0.9em 0;
}

ul, ol {
  padding-left: 2em;
}

img {
  max-width: 100%;
  height: auto;
}

.image-container {
  margin: 1em 0;
  text-align: center;
}

.image-container .image {
  display: block;
  margin: 0 auto;
}

a {
  color: #0f766e;
  text-decoration-line: underline;
  text-decoration-color: rgba(15, 118, 110, 0.4);
  text-underline-offset: 0.16em;
}

pre, code {
  font-family: "SFMono-Regular", Menlo, Consolas, "Courier New", monospace;
}

pre {
  white-space: pre-wrap;
  overflow: visible;
  overflow-wrap: anywhere;
  word-break: break-word;
  padding: 0.8em;
  border-radius: 0.5em;
  background: #f5f5f5;
  border: 1px solid #e5e5e5;
}

pre code {
  white-space: inherit;
  word-break: inherit;
  background: transparent;
  padding: 0;
}

.inline-code, code {
  color: #18045f;
  background: #f0f0f0;
  padding: 0.2em 0.4em;
  font-size: 0.9em;
  border-radius: 0.3em;
}

.code-block,
pre.code-block,
pre.shiki {
  background: #f5f5f5 !important;
  border: 1px solid #e5e5e5;
  overflow: visible !important;
}

.code-block.shiki .line {
  display: block;
  min-height: 1em;
  white-space: inherit;
}

table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  border: 1px solid #d1d5db;
  margin: 1em 0;
}

.table-row {
  border-bottom: 1px solid #d1d5db;
}

.table-cell,
td,
th {
  border: 1px solid #d1d5db;
  padding: 0.55em 0.75em;
  vertical-align: top;
  word-break: break-word;
}

.table tr:first-child .table-cell,
th {
  font-weight: 600;
  background: #f8fafc;
}

blockquote {
  border-left: 4px solid #d1d5db;
  padding-left: 1em;
  margin-left: 0;
  color: #666;
  font-style: italic;
}

.callout {
  border-left: 4px solid #d1d5db;
  border-radius: 8px;
  padding: 0.75em 0.9em;
  margin: 1em 0;
  background: #f9fafb;
}

.callout-title {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 0.45em;
  font-weight: 700;
  margin-bottom: 0.5em;
  text-align: left;
}

.callout-icon {
  width: 1.1em;
  height: 1.1em;
  flex: 0 0 1.1em;
}

.callout-content {
  margin-top: 0.3em;
}

.callout-content > *:first-child {
  margin-top: 0;
}

.callout-content > *:last-child {
  margin-bottom: 0;
}

.callout-warning {
  border-left-color: #eab308;
  background: #fffbea;
}

.callout-danger {
  border-left-color: #ef4444;
  background: #fef2f2;
}

.callout-tip,
.callout-info,
.callout-note {
  border-left-color: #60a5fa;
  background: #eff6ff;
}

.block-math,
.math-display {
  text-align: center;
  margin: 1em 0;
  overflow-x: auto;
}

.block-math mjx-container,
.math-display mjx-container {
  display: block !important;
  text-align: center !important;
}

.block-math mjx-container svg,
.block-math svg,
.math-display svg {
  display: block;
  margin: 0 auto;
  max-width: 100%;
  height: auto;
}

.inline-math,
.math-inline {
  display: inline-block;
  vertical-align: middle;
}

.diagram-svg,
.mermaid,
.echarts-container {
  text-align: center;
  margin: 1em 0;
}

.diagram-svg svg,
.mermaid svg {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 0 auto;
}

hr {
  border: none;
  border-top: 2px solid #e5e5e5;
  margin: 2em 0;
}
`.trim();

/**
 * 构建 PDF 导出的完整 HTML
 */
export const buildPdfHtml = async (options: {
  content: Descendant[];
  title: string;
  author?: string;
  chapterBreak?: boolean;
  additionalStyles?: string;
}): Promise<{ html: string; styles: string }> => {
  const { content, additionalStyles = "" } = options;

  // 1. 使用 htmlSerializerRegistry 序列化内容
  const tailwindCssCollector: string[] = [];
  const bodyHtml = await htmlSerializerRegistry.serializeAsync(content, {
    theme: "light",
    tailwindCssCollector,
  });

  // 2. 收集 Tailwind 样式
  const tailwindStyles = tailwindCssCollector.join("\n");

  // 3. 组合所有样式
  const combinedStyles = [
    PDF_BASE_STYLES,
    tailwindStyles,
    additionalStyles,
  ].join("\n\n");

  return {
    html: bodyHtml,
    styles: combinedStyles,
  };
};

/**
 * 处理代码块分页策略
 */
export const processCodeBlocks = (
  html: string,
  strategy: "avoid" | "auto" | "smart" | "adaptive" = "adaptive",
  smartThreshold = 30,
): string => {
  return html.replace(
    /<pre([^>]*)>([\s\S]*?)<\/pre>/g,
    (match, attrs, content) => {
      const lines = content.split("\n").length;

      if (strategy === "adaptive") {
        if (attrs.includes("data-lines=")) {
          return match;
        }
        return `<pre${attrs} data-lines="${lines}" data-break="adaptive">${content}</pre>`;
      }

      // 根据策略决定是否允许分页
      let allowBreak = false;

      switch (strategy) {
        case "avoid":
          // 避免分页：所有代码块都不允许分页
          allowBreak = false;
          break;

        case "auto":
          // 自动分页：所有代码块都允许分页
          allowBreak = true;
          break;

        case "smart":
          // 智能分页：根据行数阈值决定
          allowBreak = lines > smartThreshold;
          break;
      }

      if (allowBreak) {
        // 允许分页：添加 allow-break 类
        const updatedAttrs = attrs.includes("class=")
          ? attrs.replace(/class="([^"]*)"/, 'class="$1 allow-break"')
          : `${attrs} class="allow-break"`;
        return `<pre${updatedAttrs} data-lines="${lines}" data-break="allow">${content}</pre>`;
      } else {
        // 不允许分页：添加 no-break 类（明确标记）
        const updatedAttrs = attrs.includes("class=")
          ? attrs.replace(/class="([^"]*)"/, 'class="$1 no-break"')
          : `${attrs} class="no-break"`;
        return `<pre${updatedAttrs} data-lines="${lines}" data-break="avoid">${content}</pre>`;
      }
    },
  );
};
