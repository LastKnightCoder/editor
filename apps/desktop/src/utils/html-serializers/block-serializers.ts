import { escapeHtml } from "@tau/shared/escape-html";
import { HtmlSerializer } from "../htmlSerializerRegistry";
import { renderBlockMath } from "./mathjax-renderer";
import { renderCodeWithShiki } from "./shiki-renderer";
import { buildPlantumlSvgUrl } from "@tau/editor/extensions/diagram/plantuml";
import { CALLOUT_ICONS } from "../wechat";
import {
  buildCoverMap,
  cellSpan,
  isOriginCell,
  type TableCellElement,
  type TableElement,
  type TableRowElement,
} from "@tau/editor/extensions/table/span";
import { exportRowTint } from "@tau/editor/extensions/text-formatting/palette";

const DEFAULT_CALLOUT_TITLE: Record<string, string> = {
  tip: "技巧",
  info: "信息",
  warning: "警告",
  danger: "危险",
  note: "注意",
};

type CalloutType = "tip" | "info" | "warning" | "danger" | "note";

/** Slate Text/Element 联合的最小递归形状：纯文本提取只读 text/children */
type SlateTextNode = { text?: unknown; children?: unknown };

function getPlainTextFromChildren(children: SlateTextNode[] = []): string {
  const texts: string[] = [];
  const walk = (nodes: SlateTextNode[]) => {
    for (const node of nodes) {
      if (!node) continue;
      if (typeof node.text === "string") {
        texts.push(node.text);
      }
      if (Array.isArray(node.children)) {
        walk(node.children);
      }
    }
  };
  walk(children);
  return texts.join("");
}

/**
 * Block-level element serializers
 */
export const blockSerializers: HtmlSerializer[] = [
  // Paragraph
  {
    type: "paragraph",
    isBlock: true,
    toHtml: (_element, childrenHtml) => {
      return `<p class="paragraph">${childrenHtml || "<br>"}</p>`;
    },
  },

  // Header (h1-h6)
  {
    type: "header",
    isBlock: true,
    toHtml: (element, childrenHtml) => {
      const level = Math.min(Math.max(element.level || 1, 1), 6);
      return `<h${level} class="header header-${level}">${childrenHtml}</h${level}>`;
    },
  },

  // Code Block with syntax highlighting
  {
    type: "code-block",
    isBlock: true,
    toHtml: async (element, childrenHtml, _parentElement, options) => {
      if (element.children?.some((node: { type?: string }) => node.type === "code-step"))
        return childrenHtml;
      const language = element.language?.toLowerCase() || "";
      const code =
        typeof element.code === "string" && element.code.length > 0
          ? element.code
          : getPlainTextFromChildren(element.children || []);
      const codeTheme = options?.codeTheme || "github-light";
      return await renderCodeWithShiki(code, language, codeTheme);
    },
  },

  {
    type: "code-step",
    isBlock: true,
    toHtml: (element, _children, parent, options) =>
      renderCodeWithShiki(
        element.code ?? "",
        parent?.language?.toLowerCase() ?? "",
        options?.codeTheme ?? "github-light"
      ),
  },

  // Blockquote
  {
    type: "blockquote",
    isBlock: true,
    toHtml: (_element, childrenHtml) => {
      return `<blockquote class="blockquote">${childrenHtml}</blockquote>`;
    },
  },

  // 对话摘录：引文 + 来源行
  {
    type: "chat-quote",
    isBlock: true,
    toHtml: element => {
      const source = `${element.title || "无标题对话"}${element.turn ? ` · 第 ${element.turn} 轮` : ""}`;
      const text = escapeHtml(String(element.quoteText ?? "")).replace(/\n/g, "<br/>");
      return `<blockquote class="blockquote chat-quote"><p>${text}</p><footer>—— ${escapeHtml(source)}</footer></blockquote>`;
    },
  },

  // Image
  {
    type: "image",
    isBlock: true,
    toHtml: element => {
      const alt = element.alt || "";
      // 裁剪过的图导出裁剪结果
      const url = element.previewUrl || element.url || "";
      const widthAttr = element.width ? ` width="${element.width}"` : "";
      return `<figure class="image-container"><img src="${url}" alt="${alt}"${widthAttr} class="image" /></figure>`;
    },
  },

  // Bulleted List
  {
    type: "bulleted-list",
    isBlock: true,
    toHtml: (_element, childrenHtml) => {
      return `<ul class="bulleted-list">${childrenHtml}</ul>`;
    },
  },

  // Numbered List
  {
    type: "numbered-list",
    isBlock: true,
    toHtml: (_element, childrenHtml) => {
      return `<ol class="numbered-list">${childrenHtml}</ol>`;
    },
  },

  // List Item
  {
    type: "list-item",
    isBlock: true,
    toHtml: (element, childrenHtml) => {
      let iconHtml = "";
      if (element.iconType === "emoji" && element.icon) {
        iconHtml = `<span class="list-icon">${element.icon}</span>`;
      } else if (element.iconType === "image" && element.iconUrl) {
        iconHtml = `<img src="${element.iconUrl}" class="list-icon-image" />`;
      }
      return `<li class="list-item">${iconHtml}${childrenHtml}</li>`;
    },
  },

  {
    type: "check-list",
    isBlock: true,
    toHtml: (_element, childrenHtml) => {
      return `<ul class="check-list">${childrenHtml}</ul>`;
    },
  },

  {
    type: "check-list-item",
    isBlock: true,
    toHtml: (element, childrenHtml) => {
      const checked = element.checked ? "checked" : "";
      const checkedClass = element.checked ? "checked" : "unchecked";
      return `<li class="check-list-item ${checkedClass}">
        <span class="checkbox ${checked}"></span>
        <span class="content">${childrenHtml}</span>
      </li>`;
    },
  },

  // Table
  {
    type: "table",
    isBlock: true,
    prepare: element => {
      const table = element as unknown as TableElement;
      const map = buildCoverMap(table);
      const excludedElements = new Set<TableCellElement>();
      table.children.forEach((row, r) =>
        row.children.forEach((cell, c) => {
          if (!isOriginCell(map, r, c)) excludedElements.add(cell);
        })
      );
      return { excludedElements };
    },
    toHtml: (_element, childrenHtml) => {
      return `<table class="table"><tbody>${childrenHtml}</tbody></table>`;
    },
  },

  // Table Row
  {
    type: "table-row",
    isBlock: true,
    toHtml: (_element, childrenHtml) => {
      return `<tr class="table-row">${childrenHtml}</tr>`;
    },
  },

  // Table Cell
  {
    type: "table-cell",
    toHtml: (element: TableCellElement, childrenHtml, parent?: TableRowElement) => {
      const [rowSpan, colSpan] = cellSpan(element);
      const spans = `${rowSpan > 1 ? ` rowspan="${rowSpan}"` : ""}${colSpan > 1 ? ` colspan="${colSpan}"` : ""}`;
      // 行底色画在格上（压过表头灰底）；公众号等目标不支持 CSS 变量，写浅色档具体色值
      const tint = exportRowTint(parent?.color);
      const style = tint ? ` style="background:${tint}"` : "";
      return `<td class="table-cell"${spans}${style}>${childrenHtml}</td>`;
    },
  },

  // Block Math (using MathJax SVG for WeChat compatibility)
  {
    type: "block-math",
    isBlock: true,
    toHtml: async element => {
      const tex = element.tex || "";
      const svgHtml = await renderBlockMath(tex);
      return `<div class="block-math">${svgHtml}</div>`;
    },
  },

  // Callout
  {
    type: "callout",
    isBlock: true,
    toHtml: (element, childrenHtml) => {
      const type = (element.calloutType || "note") as CalloutType;
      const title = escapeHtml(
        element.title || DEFAULT_CALLOUT_TITLE[type] || DEFAULT_CALLOUT_TITLE.note
      );
      const iconUrl = CALLOUT_ICONS[type] || CALLOUT_ICONS.note;
      return `<div class="callout callout-${type}">
        <div class="callout-title"${element.title?.trim() ? "" : " data-default-title"}><img src="${iconUrl}" class="callout-icon" alt="" />${title}</div>
        <div class="callout-content">${childrenHtml}</div>
      </div>`;
    },
  },

  // Detail (Collapsible) - using checkbox hack for pure HTML/CSS implementation
  {
    type: "detail",
    isBlock: true,
    toHtml: (element, childrenHtml) => {
      const title = element.title || "详情";
      const open = element.open;
      const uniqueId = `detail-${Math.random().toString(36).substr(2, 9)}`;

      return `<div class="detail-wrapper">
        <input type="checkbox" id="${uniqueId}" class="detail-checkbox" ${open ? "checked" : ""} />
        <label for="${uniqueId}" class="detail-label">
          <span class="detail-arrow">▶</span>
          <span class="detail-title-text">${title}</span>
        </label>
        <div class="detail-content">${childrenHtml}</div>
      </div>`;
    },
  },

  // Highlight Block
  {
    type: "highlight-block",
    isBlock: true,
    toHtml: (element, childrenHtml) => {
      const color = element.color || "yellow";
      return `<div class="highlight-block highlight-block-${color}">${childrenHtml}</div>`;
    },
  },

  // Divide Line
  {
    type: "divide-line",
    isBlock: true,
    toHtml: () => {
      return `<hr class="divide-line" />`;
    },
  },

  // Mermaid (use SVG if stored, otherwise fallback to code block)
  {
    type: "mermaid",
    isBlock: true,
    toHtml: element => {
      const chart = element.chart || "";
      const svg = element.svg;
      if (svg) {
        return `<div class="diagram-svg mermaid-svg">${svg}</div>`;
      }
      // Fallback to code block
      return `<pre class="mermaid-fallback"><code class="language-mermaid">${escapeHtml(chart)}</code></pre>`;
    },
  },

  // Video
  {
    type: "video",
    isBlock: true,
    toHtml: element => {
      const src = element.src || "";
      const metaInfo = element.metaInfo;
      if (metaInfo?.title) {
        return `<p class="video-placeholder">[视频: ${metaInfo.title}]<br><a href="${src}">${src}</a></p>`;
      }
      return `<p class="video-placeholder">[视频: <a href="${src}">${src}</a>]</p>`;
    },
  },

  // Audio
  {
    type: "audio",
    isBlock: true,
    toHtml: element => {
      const src = element.src || "";
      return `<p class="audio-placeholder">[音频: <a href="${src}">${src}</a>]</p>`;
    },
  },

  // 缺少 HTML 插件时导出转义源码，避免静默丢失内容。
  {
    type: "html-block",
    isBlock: true,
    toHtml: element => {
      const html = element.html || "";
      return `<pre class="html-source"><code>${escapeHtml(html)}</code></pre>`;
    },
  },

  // Front Matter (hidden)
  {
    type: "front-matter",
    isBlock: true,
    toHtml: () => {
      return "";
    },
  },

  // Webview
  {
    type: "webview",
    isBlock: true,
    toHtml: element => {
      const url = element.url || "";
      const height = element.height || 400;
      return `<p class="webview-placeholder">[网页视图: <a href="${url}">${url}</a>] (高度: ${height}px)</p>`;
    },
  },

  // 网页书签：导出为带标题与描述的链接段落，封面不导出
  {
    type: "bookmark",
    isBlock: true,
    toHtml: element => {
      const url = escapeHtml(element.url || "");
      const title = escapeHtml(
        element.overrides?.title || element.meta?.title || element.url || ""
      );
      const description = element.overrides?.description ?? element.meta?.description;
      return `<p class="bookmark"><a href="${url}">${title}</a>${
        description
          ? `<br /><span class="bookmark-description">${escapeHtml(description)}</span>`
          : ""
      }</p>`;
    },
  },

  {
    type: "file-attachment",
    isBlock: true,
    toHtml: element => {
      const name = escapeHtml(element.fileName || "附件");
      const url = element.filePath || "";
      return /^https?:\/\//i.test(url)
        ? `<p><a href="${escapeHtml(url)}">${name}</a></p>`
        : `<p>附件：${name}</p>`;
    },
  },

  // Tabs
  {
    type: "tabs",
    isBlock: true,
    toHtml: (_element, childrenHtml) => {
      return `<div class="tabs">${childrenHtml}</div>`;
    },
  },

  // Tab Pane
  {
    type: "tab-pane",
    isBlock: true,
    toHtml: (element, childrenHtml) => {
      const title = element.title ? `<p><strong>${escapeHtml(element.title)}</strong></p>` : "";
      return `<div class="tab-pane">${title}${childrenHtml}</div>`;
    },
  },

  // 插件不可用时保留乐谱源码；已启用插件的 SVG 导出优先于此回退。
  {
    type: "abc",
    isBlock: true,
    toHtml: element => {
      const content = element.content || "";
      return `<pre class="abc-notation"><code>${escapeHtml(content)}</code></pre>`;
    },
  },

  // PlantUML：导出时直接使用渲染服务器地址
  {
    type: "plantuml",
    isBlock: true,
    toHtml: element => {
      const content = element.content || "";
      const imgUrl = buildPlantumlSvgUrl(content);
      if (imgUrl) {
        return `<div class="diagram-svg plantuml-svg"><img src="${imgUrl}" alt="PlantUML diagram" style="max-width:100%" /></div>`;
      }

      return `<pre class="plantuml-fallback"><code>${escapeHtml(content)}</code></pre>`;
    },
  },

  // Typst (use compiled HTML if available)
  {
    type: "typst",
    isBlock: true,
    toHtml: element => {
      const content = element.content || "";
      const html = element.html;

      // If HTML is available, use it directly
      if (html) {
        return `<div class="typst-html">${html}</div>`;
      }

      // Fallback to code block
      return `<pre class="typst-fallback"><code>${escapeHtml(content)}</code></pre>`;
    },
  },
];
