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
