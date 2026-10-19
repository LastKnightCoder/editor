/**
 * 插件 README / CHANGELOG 的文档化：导入时丢弃 HTML，再按白名单过滤编辑器节点。
 *
 * 资料来自第三方插件包，按不可信内容处理：只保留纯展示的内置节点；
 * 原始 HTML 丢弃，图片音视频不加载，所有语言围栏按源码代码块展示，
 * 指向应用内资源的节点（内容链接、附件）退化为纯文本，链接只保留 http(s)。
 */

import { Element, Node, Text, type Descendant } from "slate";
import { createMarkdownProcessor } from "@tau/markdown";
import { textFormattingCodec } from "@tau/editor-text-formatting/markdown";
import { desktopCodecComposition } from "@/utils/markdown-composition";

const SAFE_ELEMENTS = new Set([
  "paragraph",
  "header",
  "blockquote",
  "callout",
  "detail",
  "highlight-block",
  "bulleted-list",
  "numbered-list",
  "list-item",
  "check-list",
  "check-list-item",
  "table",
  "table-row",
  "table-cell",
  "code-block",
  "block-math",
  "inline-math",
  "divide-line",
  "kbd",
  "underline",
  "styled-text",
  "emoji",
  "link",
]);
const MEDIA_LABEL: Record<string, string> = {
  image: "图片",
  "inline-image": "图片",
  "image-gallery": "图片",
  video: "视频",
  audio: "音频",
};

const documentMarkdown = createMarkdownProcessor({
  codecs: desktopCodecComposition.filter(codec => !codec.fence),
  textCodecs: [textFormattingCodec],
});

type Loose = Element & Record<string, unknown>;

const text = (value: string): Descendant => ({ type: "formatted", text: value }) as Descendant;
const paragraph = (value: string): Descendant =>
  ({ type: "paragraph", children: [text(value)] }) as Descendant;
const isHttp = (url: unknown) => typeof url === "string" && /^https?:\/\//i.test(url);

function mediaNotice(node: Loose): string {
  const alt = typeof node.alt === "string" && node.alt.trim() ? `：${node.alt.trim()}` : "";
  return `${MEDIA_LABEL[node.type]}不在应用内加载${alt}`;
}

function sanitizeChildren(children: Descendant[]): Descendant[] {
  const inline = children.some(child => Text.isText(child));
  const result = children.flatMap(child => sanitizeNode(child, inline));
  return result.length > 0 ? result : [text("")];
}

function sanitizeNode(node: Descendant, inline: boolean): Descendant[] {
  if (Text.isText(node)) return [node];
  const element = node as Loose;
  if (Object.hasOwn(MEDIA_LABEL, element.type))
    return [inline ? text(`[${mediaNotice(element)}]`) : paragraph(mediaNotice(element))];
  if (element.type === "link" && !isHttp(element.url)) return sanitizeChildren(element.children);
  if (SAFE_ELEMENTS.has(element.type))
    return [{ ...element, children: sanitizeChildren(element.children) } as Descendant];

  const content = Node.string(element);
  if (!content) return [];
  return [inline ? text(content) : paragraph(content)];
}

export function toPluginDocument(markdown: string): Descendant[] {
  const nodes = documentMarkdown
    .importFromMarkdown(markdown, ["html", "yaml"])
    .flatMap(node => sanitizeNode(node, false));
  return nodes.length > 0 ? nodes : [paragraph("")];
}
