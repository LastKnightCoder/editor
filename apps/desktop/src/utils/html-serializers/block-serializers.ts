import { HtmlSerializer } from "../htmlSerializerRegistry";
import { renderBlockMath } from "./mathjax-renderer";
import { renderCodeWithShiki } from "./shiki-renderer";
import { buildPlantumlSvgUrl } from "@tau/editor/extensions/diagram/plantuml";
import { CALLOUT_ICONS } from "../wechat";

const DEFAULT_CALLOUT_TITLE: Record<string, string> = {
  tip: "技巧",
  info: "信息",
  warning: "警告",
  danger: "危险",
  note: "注意",
};

type CalloutType = "tip" | "info" | "warning" | "danger" | "note";

/**
 * Escape HTML special characters in code
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getPlainTextFromChildren(children: any[] = []): string {
  const texts: string[] = [];
  const walk = (nodes: any[]) => {
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

  // Check List
  {
    type: "check-list",
    isBlock: true,
    toHtml: (_element, childrenHtml) => {
      return `<ul class="check-list">${childrenHtml}</ul>`;
    },
  },

  // Check List Item
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
    toHtml: (_element, childrenHtml) => {
      return `<td class="table-cell">${childrenHtml}</td>`;
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
      const title = element.title || DEFAULT_CALLOUT_TITLE[type] || DEFAULT_CALLOUT_TITLE.note;
      const iconUrl = CALLOUT_ICONS[type] || CALLOUT_ICONS.note;
      return `<div class="callout callout-${type}">
        <div class="callout-title"><img src="${iconUrl}" class="callout-icon" alt="" />${title}</div>
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
      // Check if SVG is stored (future support)
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
    toHtml: (_element, childrenHtml) => {
      return `<div class="tab-pane">${childrenHtml}</div>`;
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
