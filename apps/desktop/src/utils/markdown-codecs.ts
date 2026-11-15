/**
 * Desktop 业务元素的 Markdown 编解码（docs/editor-refactor 01 §8.2）。
 *
 * 渲染进程与 Electron 主进程共用这一份，所以只能引类型与纯函数，不能引 React 组件。
 * 导入端复用 @tau/shared 的 markdownCustomDirectives（mobile / extension 粘贴导入也用它），
 * 两边解析规则只维护一份。
 */
// 深路径：@tau/shared 根入口会带出 React 组件，主进程不能引
import { markdownCustomDirectives } from "@tau/shared/markdown-directives";
import type { MarkdownCodec, MarkdownSerializer } from "@tau/markdown";

type Serializer = Omit<MarkdownSerializer, "type">;

const contentLinkAttributes = (element: Record<string, unknown>, childrenStr: string) => {
  const attributes: string[] = [];
  if (typeof element.refId !== "undefined") attributes.push(`refId=${element.refId}`);
  if (typeof element.contentId !== "undefined") attributes.push(`contentId=${element.contentId}`);
  if (element.contentType) attributes.push(`contentType=${element.contentType}`);
  const title = element.contentTitle || element.title;
  if (title) {
    const escapedTitle = String(title).replace(/"/g, "&quot;");
    attributes.push(`title="${escapedTitle}"`);
  }
  const attributeStr = attributes.length > 0 ? `{${attributes.join(" ")}}` : "";
  return `:content-link[${childrenStr}]${attributeStr}`;
};

const contentLinkSerializer: Serializer = {
  toMarkdown: (element, childrenStr) => contentLinkAttributes(element, childrenStr),
  toMarkdownStructured: (element, childrenStr) => ({
    output: contentLinkAttributes(element, childrenStr),
    childrenStart: { line: 0, ch: ":content-link[".length },
  }),
};

const quoteAttr = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/\\/g, "&#92;").replace(/"/g, "&quot;");
const escapeBrackets = (value: string) => value.replace(/([\\[\]])/g, "\\$1");
const chatRefLabel = (element: Record<string, unknown>) =>
  `${String(element.title || "无标题对话")}${element.turn ? ` · 第 ${element.turn} 轮` : ""}`;

// 行内聊天引用：标签是出处文字，属性带定位；导入经 markdown-directives 的 chat-ref 还原
const chatRefSerializer: Serializer = {
  toMarkdown: element => {
    const attributes = [`session="${quoteAttr(String(element.sessionId ?? ""))}"`];
    if (element.entryId) attributes.push(`entry="${quoteAttr(String(element.entryId))}"`);
    if (element.title) attributes.push(`title="${quoteAttr(String(element.title))}"`);
    if (element.turn) attributes.push(`turn=${element.turn}`);
    return `:chat-ref[${escapeBrackets(chatRefLabel(element))}]{${attributes.join(" ")}}`;
  },
};

// 对话摘录：导出为引用块 + 来源行，可读优先；导入不反向识别，按普通引用块处理
const chatQuoteSerializer: Serializer = {
  isBlock: true,
  toMarkdown: element => {
    const lines = String(element.quoteText ?? "")
      .split("\n")
      .map(line => `> ${line}`.trimEnd());
    return [...lines, ">", `> —— ${chatRefLabel(element)}`].join("\n");
  },
};

const fileAttachmentSerializer: Serializer = {
  isBlock: true,
  toMarkdown: element => {
    const attributes: string[] = [];
    attributes.push(`fileName="${element.fileName}"`);
    attributes.push(`filePath="${element.filePath}"`);
    if (element.localFilePath) attributes.push(`localFilePath="${element.localFilePath}"`);
    attributes.push(`isLocal=${element.isLocal}`);
    attributes.push(`uuid="${element.uuid}"`);
    return `:::file-attachment{${attributes.join(" ")}}\n:::`;
  },
};

// `$` 点名的 Skill 芯片：正文里保留成 `$名称`，点名信息另由 ChatInputArea 提取；只有导出
const skillRefSerializer: Serializer = {
  toMarkdown: element => `$${element.name}`,
  toMarkdownStructured: element => ({
    output: `$${element.name}`,
    childrenStart: { line: 0, ch: 0 },
  }),
};

const summaryTimestampSerializer: Serializer = {
  isBlock: false,
  toMarkdown: element => `:time{start=${element.start} end=${element.end}}`,
};

const pickDirectives = (...names: string[]) =>
  Object.fromEntries(names.map(name => [name, markdownCustomDirectives[name]]));

export const desktopMarkdownCodecs: MarkdownCodec[] = [
  {
    type: "content-link",
    directives: pickDirectives("content-link"),
    serializer: contentLinkSerializer,
    inlineWrapperDirective: "content-link",
  },
  {
    type: "chat-ref",
    directives: pickDirectives("chat-ref"),
    serializer: chatRefSerializer,
    isVoid: true,
    // 指令标签供 Markdown 阅读，Slate 的 void 节点只保留空叶子。
    normalize: element =>
      element.children.length > 1
        ? [{ ...element, children: [{ type: "formatted", text: "" }] }]
        : null,
  },
  { type: "chat-quote", serializer: chatQuoteSerializer, isVoid: true },
  {
    type: "file-attachment",
    directives: pickDirectives("file-attachment"),
    serializer: fileAttachmentSerializer,
    isVoid: true,
  },
  {
    type: "summary-timestamp",
    directives: pickDirectives("time"),
    serializer: summaryTimestampSerializer,
  },
  { type: "skill-ref", serializer: skillRefSerializer },
  // 白板块没有 Markdown 语法，只在位置映射里按 void 处理（与迁移前一致）
  { type: "whiteboard", isVoid: true },
];
