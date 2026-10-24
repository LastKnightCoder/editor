/**
 * 插件 README / CHANGELOG 的文档化：导入时丢弃 HTML，再按白名单过滤编辑器节点。
 *
 * 资料来自第三方插件包，按不可信内容处理：只保留纯展示的内置节点；
 * 原始 HTML 丢弃，图片音视频不加载，所有语言围栏按源码代码块展示，
 * 指向应用内资源的节点（内容链接、附件）退化为纯文本，链接只保留 http(s)。
 * 各端只提供本端的 Markdown 导入与资源声明。
 */

import {
  contentResourceSlots,
  type ContentResourceDeclarations,
  type ContentResourceKind,
  type ContentResourceSpec,
} from "@tau/db-schema/content-resources";
import { Element, Node, Text, type Descendant } from "slate";

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
const MEDIA_LABEL: Record<ContentResourceKind, string> = {
  image: "图片",
  video: "视频",
  audio: "音频",
  file: "文件",
};

type Loose = Element & Record<string, unknown>;

const text = (value: string): Descendant => ({ type: "formatted", text: value }) as Descendant;
const paragraph = (value: string): Descendant =>
  ({ type: "paragraph", children: [text(value)] }) as Descendant;
const isHttp = (url: unknown) => typeof url === "string" && /^https?:\/\//i.test(url);

/** 声明了资源的节点不加载资源，换成说明；替代文字取第一项资源的 alt 字段 */
function mediaNotice(node: Loose, specs: readonly ContentResourceSpec[]): string {
  const [slot] = contentResourceSlots(node, specs);
  const value = slot?.spec.alt ? slot.owner[slot.spec.alt] : undefined;
  const alt = typeof value === "string" && value.trim() ? `：${value.trim()}` : "";
  return `${MEDIA_LABEL[specs[0].kind]}不在应用内加载${alt}`;
}

function sanitizeChildren(
  children: Descendant[],
  resources: ContentResourceDeclarations
): Descendant[] {
  const inline = children.some(child => Text.isText(child));
  const result = children.flatMap(child => sanitizeNode(child, inline, resources));
  return result.length > 0 ? result : [text("")];
}

function sanitizeNode(
  node: Descendant,
  inline: boolean,
  resources: ContentResourceDeclarations
): Descendant[] {
  if (Text.isText(node)) return [node];
  const element = node as Loose;
  // 本包的 slate 类型未经编辑器扩充，节点类型按字符串比较
  const type: string = element.type;
  const specs = resources[type];
  if (specs?.length) {
    const notice = mediaNotice(element, specs);
    return [inline ? text(`[${notice}]`) : paragraph(notice)];
  }
  if (type === "link" && !isHttp(element.url)) return sanitizeChildren(element.children, resources);
  if (SAFE_ELEMENTS.has(type))
    return [{ ...element, children: sanitizeChildren(element.children, resources) } as Descendant];

  const content = Node.string(element);
  if (!content) return [];
  return [inline ? text(content) : paragraph(content)];
}

export function createPluginDocumentReader(options: {
  /** 本端 Markdown 导入；调用方须去掉语言围栏 codec，让所有围栏都成为代码块 */
  importFromMarkdown: (markdown: string, ignoreTypes: string[]) => Descendant[];
  /** 内置与已加载内容插件的节点资源声明 */
  resources: () => ContentResourceDeclarations;
}) {
  return (markdown: string): Descendant[] => {
    const resources = options.resources();
    const nodes = options
      .importFromMarkdown(markdown, ["html", "yaml"])
      .flatMap(node => sanitizeNode(node, false, resources));
    return nodes.length > 0 ? nodes : [paragraph("")];
  };
}
