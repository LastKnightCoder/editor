import { HtmlSerializer } from "../htmlSerializerRegistry";
import { renderInlineMath } from "./mathjax-renderer";
import { compileTailwindForHtml } from "./tailwind-compiler";

/**
 * Inline element serializers
 */
export const inlineSerializers: HtmlSerializer[] = [
  // Link
  {
    type: "link",
    isBlock: false,
    toHtml: (element, childrenHtml) => {
      const url = element.url || "#";
      return `<a href="${url}" class="link">${childrenHtml}</a>`;
    },
  },

  // Inline Math (using MathJax SVG for WeChat compatibility)
  {
    type: "inline-math",
    isBlock: false,
    toHtml: async (element) => {
      const tex = element.tex || "";
      const svgHtml = await renderInlineMath(tex);
      return `<span class="inline-math">${svgHtml}</span>`;
    },
  },

  // Inline Image
  {
    type: "inline-image",
    isBlock: false,
    toHtml: (element) => {
      const url = element.url || "";
      const alt = element.alt || "";
      return `<img src="${url}" alt="${alt}" class="inline-image" />`;
    },
  },

  // Underline
  {
    type: "underline",
    isBlock: false,
    toHtml: (element, childrenHtml) => {
      const color = element.color || "default";
      const lineType = element.lineType || "solid";
      return `<span class="underline underline-${color} underline-${lineType}">${childrenHtml}</span>`;
    },
  },

  // Styled Text
  {
    type: "styled-text",
    isBlock: false,
    toHtml: (element, childrenHtml) => {
      const color = element.color || "yellow";
      return `<span class="styled-text styled-text-${color}">${childrenHtml}</span>`;
    },
  },

  // Emoji
  {
    type: "emoji",
    isBlock: false,
    toHtml: (element) => {
      return element.nativeEmoji || element.emoji || "";
    },
  },

  // Annotation (Footnote)
  {
    type: "annotation",
    isBlock: false,
    toHtml: (element) => {
      const content = element.content || "";
      // Escape the content for HTML attribute
      const escapedContent = content
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      return `<sup class="annotation" title="${escapedContent}">[注]</sup>`;
    },
  },

  // HTML Inline (with Tailwind compilation)
  {
    type: "html-inline",
    isBlock: false,
    toHtml: async (element, _childrenHtml, _parentElement, options) => {
      const html = element.html || "";
      const css = await compileTailwindForHtml(html, "html");
      if (css && options?.tailwindCssCollector) {
        options.tailwindCssCollector.push(css);
      }
      return html;
    },
  },

  // Comment
  {
    type: "comment",
    isBlock: false,
    toHtml: (element, childrenHtml) => {
      const note = element.note || "";
      const escapedNote = note
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      return `<span class="comment" title="${escapedNote}">${childrenHtml}</span>`;
    },
  },

  {
    type: "content-link",
    isBlock: false,
    toHtml: (_element, childrenHtml) => {
      return `<span class="content-link">${childrenHtml}</span>`;
    },
  },
];
