import { CustomElement } from "@tau/editor/src";
import { trim } from "lodash";

const DEFAULT_TITLE = {
  tip: "技巧",
  info: "信息",
  warning: "警告",
  danger: "危险",
  note: "注意",
};

export interface SerializerOutput {
  output: string;

  // children 内容相对于 output 的起始位置
  childrenStart?: { line: number; ch: number };

  // 每行的额外偏移（用于 blockquote "> ", list "- " 等）
  perLineOffset?: number;

  // 从指定子元素索引起，额外插入行导致的行号偏移
  childLineShifts?: Array<{ startIndex: number; lineDelta: number }>;

  // 是否跳过子元素映射（void 元素）
  skipChildren?: boolean;

  // void 元素的属性位置映射
  propertyMappings?: {
    [propName: string]: {
      start: { line: number; ch: number };
      multiline: boolean;
    };
  };
}

export interface MarkdownSerializer {
  type: string;
  isBlock?: boolean;
  toMarkdown: (
    element: any,
    childrenStr: string,
    parentElement?: any,
  ) => string;

  // 新增：带位置信息的序列化（可选）
  toMarkdownStructured?: (
    element: any,
    childrenStr: string,
    parentElement?: any,
  ) => SerializerOutput;
}

export class MarkdownSerializerRegistry {
  private serializers: MarkdownSerializer[] = [];
  private blockTypes: Set<string> = new Set();
  private footnoteCounter = 0;
  private footnoteDefinitions: Map<number, string> = new Map();

  constructor() {
    this.registerDefaultSerializers();
  }

  private buildSimpleTable(rows: string[]): string {
    if (rows.length === 0) return "";
    const firstRow = rows[0];
    const pipeCount = firstRow.split("|").length - 1;
    const cellCount = Math.max(pipeCount - 1, 0);
    const separator = `| ${Array.from({ length: cellCount })
      .map(() => "---")
      .join(" | ")} |`;
    const restRows = rows.slice(1);
    return [firstRow, separator, ...restRows].join("\n");
  }

  resetFootnotes(): void {
    this.footnoteCounter = 0;
    this.footnoteDefinitions.clear();
  }

  addFootnote(content: string): number {
    this.footnoteCounter++;
    this.footnoteDefinitions.set(this.footnoteCounter, content);
    return this.footnoteCounter;
  }

  getFootnoteDefinitions(): string {
    if (this.footnoteDefinitions.size === 0) {
      return "";
    }
    const definitions = Array.from(this.footnoteDefinitions.entries())
      .map(([id, content]) => `[^${id}]: ${content}`)
      .join("\n");
    return `\n\n${definitions}`;
  }

  register(serializer: MarkdownSerializer): void {
    const existingIndex = this.serializers.findIndex(
      (s) => s.type === serializer.type,
    );
    if (existingIndex >= 0) {
      this.serializers[existingIndex] = serializer;
    } else {
      this.serializers.push(serializer);
    }

    if (serializer.isBlock) {
      this.blockTypes.add(serializer.type);
    }
  }

  registerMany(serializers: MarkdownSerializer[]): void {
    serializers.forEach((serializer) => this.register(serializer));
  }

  getSerializer(type: string): MarkdownSerializer | undefined {
    return this.serializers.find((s) => s.type === type);
  }

  isBlock(element: CustomElement): boolean {
    return this.blockTypes.has(element.type);
  }

  private registerDefaultSerializers(): void {
    this.registerMany([
      {
        type: "paragraph",
        isBlock: true,
        toMarkdown: (_element, childrenStr) => childrenStr,
        toMarkdownStructured: (_element, childrenStr) => ({
          output: childrenStr,
          childrenStart: { line: 0, ch: 0 },
        }),
      },
      {
        type: "header",
        isBlock: true,
        toMarkdown: (element, childrenStr) => {
          const level = element.level || 1;
          const hashes = "#".repeat(level);
          return `${hashes} ${childrenStr}`;
        },
        toMarkdownStructured: (element, childrenStr) => {
          const level = element.level || 1;
          const hashes = "#".repeat(level);
          const prefix = `${hashes} `;
          return {
            output: `${prefix}${childrenStr}`,
            childrenStart: { line: 0, ch: prefix.length },
          };
        },
      },
      {
        type: "link",
        toMarkdown: (element, childrenStr) => {
          return `[${childrenStr}](${element.url})`;
        },
        toMarkdownStructured: (element, childrenStr) => {
          return {
            output: `[${childrenStr}](${element.url})`,
            childrenStart: { line: 0, ch: 1 },
          };
        },
      },
      {
        type: "content-link",
        toMarkdown: (element, childrenStr) => {
          const attributes = [];
          if (typeof element.refId !== "undefined") {
            attributes.push(`refId=${element.refId}`);
          }
          if (typeof element.contentId !== "undefined") {
            attributes.push(`contentId=${element.contentId}`);
          }
          if (element.contentType) {
            attributes.push(`contentType=${element.contentType}`);
          }
          const title = element.contentTitle || element.title;
          if (title) {
            const escapedTitle = String(title).replace(/"/g, "&quot;");
            attributes.push(`title="${escapedTitle}"`);
          }
          const attributeStr =
            attributes.length > 0 ? `{${attributes.join(" ")}}` : "";
          return `:content-link[${childrenStr}]${attributeStr}`;
        },
        toMarkdownStructured: (element, childrenStr) => {
          const attributes = [];
          if (typeof element.refId !== "undefined") {
            attributes.push(`refId=${element.refId}`);
          }
          if (typeof element.contentId !== "undefined") {
            attributes.push(`contentId=${element.contentId}`);
          }
          if (element.contentType) {
            attributes.push(`contentType=${element.contentType}`);
          }
          const title = element.contentTitle || element.title;
          if (title) {
            const escapedTitle = String(title).replace(/"/g, "&quot;");
            attributes.push(`title="${escapedTitle}"`);
          }
          const attributeStr =
            attributes.length > 0 ? `{${attributes.join(" ")}}` : "";
          return {
            output: `:content-link[${childrenStr}]${attributeStr}`,
            childrenStart: { line: 0, ch: ":content-link[".length },
          };
        },
      },
      {
        type: "code-block",
        isBlock: true,
        toMarkdown: (element) => {
          const language = element.language || "";
          return `\`\`\`${language}\n${element.code || ""}\n\`\`\``;
        },
        toMarkdownStructured: (element) => {
          const language = element.language || "";
          const code = element.code || "";
          return {
            output: `\`\`\`${language}\n${code}\n\`\`\``,
            skipChildren: true,
            propertyMappings: {
              code: {
                start: { line: 1, ch: 0 },
                multiline: true,
              },
            },
          };
        },
      },
      {
        type: "blockquote",
        isBlock: true,
        toMarkdown: (_element, childrenStr) => {
          return childrenStr
            .split("\n")
            .map((line) => `> ${line}`)
            .join("\n");
        },
        toMarkdownStructured: (_element, childrenStr) => {
          const output = childrenStr
            .split("\n")
            .map((line) => `> ${line}`)
            .join("\n");
          return {
            output,
            childrenStart: { line: 0, ch: 2 },
            perLineOffset: 2, // 每行前缀 "> "
          };
        },
      },
      {
        type: "image",
        isBlock: true,
        toMarkdown: (element) => {
          const alt = element.alt || "";
          return `![${alt}](${element.url})`;
        },
      },
      {
        type: "inline-image",
        isBlock: false,
        toMarkdown: (element) => {
          const alt = element.alt || "";
          return `![${alt}](${element.url})`;
        },
      },
      {
        type: "image-gallery",
        isBlock: true,
        toMarkdown: (element) => {
          return element.images
            .map((image: any) => `![](${image.url})`)
            .join("\n");
        },
      },
      {
        type: "block-math",
        isBlock: true,
        toMarkdown: (element) => {
          return `$$\n${element.tex || ""}\n$$`;
        },
      },
      {
        type: "inline-math",
        toMarkdown: (element) => {
          return `$${element.tex || ""}$`;
        },
      },
      {
        type: "html-block",
        isBlock: true,
        toMarkdown: (element) => {
          return element.html || "";
        },
      },
      {
        type: "html-inline",
        toMarkdown: (element) => {
          return element.html || "";
        },
      },
      {
        type: "bulleted-list",
        isBlock: true,
        toMarkdown: (_element, childrenStr) => {
          return childrenStr;
        },
      },
      {
        type: "numbered-list",
        isBlock: true,
        toMarkdown: (_element, childrenStr) => {
          return childrenStr;
        },
      },
      {
        type: "list-item",
        isBlock: true,
        toMarkdown: (element, children: string, parentElement) => {
          // Get icon prefix if exists (using custom protocol syntax)
          let iconPrefix = "";
          if (element.iconType === "emoji" && element.icon) {
            iconPrefix = `![](emoji:${element.icon})`;
          } else if (element.iconType === "image" && element.iconUrl) {
            iconPrefix = `![](list-icon:${element.iconUrl})`;
          }

          if (parentElement.type === "bulleted-list") {
            // children 按照 \n 分割，第一行加上 -，其它行加上两个空格
            return children
              .trim()
              .split("\n")
              .map((child, index) => {
                if (index === 0) {
                  return `- ${iconPrefix}${child}`;
                } else {
                  return `  ${child}`;
                }
              })
              .join("\n");
          } else if (parentElement.type === "numbered-list") {
            // 找到当前元素在父元素中的索引，第一行加上 1，然后加上 . 和一个空格，其它行加上两个空格
            const index = parentElement.children.findIndex(
              (child: any) => child === element,
            );
            return children
              .trim()
              .split("\n")
              .map((child, childIndex) => {
                if (childIndex === 0) {
                  return `${index + 1}. ${child}`;
                } else {
                  return `  ${child}`;
                }
              })
              .join("\n");
          } else {
            return children;
          }
        },
        toMarkdownStructured: (element, children: string, parentElement) => {
          let iconPrefix = "";
          if (element.iconType === "emoji" && element.icon) {
            iconPrefix = `![](emoji:${element.icon})`;
          } else if (element.iconType === "image" && element.iconUrl) {
            iconPrefix = `![](list-icon:${element.iconUrl})`;
          }

          let output: string;
          let firstLinePrefix: string;

          if (parentElement.type === "bulleted-list") {
            firstLinePrefix = `- ${iconPrefix}`;
            output = children
              .trim()
              .split("\n")
              .map((child, index) => {
                if (index === 0) {
                  return `${firstLinePrefix}${child}`;
                } else {
                  return `  ${child}`;
                }
              })
              .join("\n");
          } else if (parentElement.type === "numbered-list") {
            const index = parentElement.children.findIndex(
              (child: any) => child === element,
            );
            firstLinePrefix = `${index + 1}. `;
            output = children
              .trim()
              .split("\n")
              .map((child, childIndex) => {
                if (childIndex === 0) {
                  return `${firstLinePrefix}${child}`;
                } else {
                  return `  ${child}`;
                }
              })
              .join("\n");
          } else {
            output = children;
            firstLinePrefix = "";
          }

          return {
            output,
            childrenStart: { line: 0, ch: firstLinePrefix.length },
            perLineOffset: 2, // 后续行缩进 2 个空格
          };
        },
      },
      {
        type: "table",
        isBlock: true,
        toMarkdown: (_element, children) => {
          const rows = children.split("\n").filter(trim);
          return this.buildSimpleTable(rows);
        },
        toMarkdownStructured: (_element, children) => {
          const rows = children.split("\n").filter(trim);
          if (rows.length === 0) {
            return { output: "" };
          }
          return {
            output: this.buildSimpleTable(rows),
            childLineShifts:
              rows.length > 1 ? [{ startIndex: 1, lineDelta: 1 }] : [],
          };
        },
      },
      {
        type: "table-row",
        isBlock: true,
        toMarkdown: (_element, children) => {
          return `| ${children.split("\n").join("")}`.trim();
        },
        toMarkdownStructured: (_element, children) => {
          return {
            output: `| ${children.split("\n").join("")}`.trim(),
            childrenStart: { line: 0, ch: 2 },
          };
        },
      },
      {
        type: "table-cell",
        toMarkdown: (_element, children) => {
          return `${children.trim()} | `;
        },
        toMarkdownStructured: (_element, children) => {
          return {
            output: `${children.trim()} | `,
            childrenStart: { line: 0, ch: 0 },
          };
        },
      },
      {
        type: "mermaid",
        isBlock: true,
        toMarkdown: (element) => {
          return `\`\`\`mermaid\n${element.chart || ""}\n\`\`\``;
        },
      },
      {
        type: "abc",
        isBlock: true,
        toMarkdown: (element) => {
          return `\`\`\`abc\n${element.content || ""}\n\`\`\``;
        },
      },
      {
        type: "plantuml",
        isBlock: true,
        toMarkdown: (element) => {
          return `\`\`\`plantuml\n${element.content || ""}\n\`\`\``;
        },
      },
      {
        type: "tikz",
        isBlock: true,
        toMarkdown: (element) => {
          return `\`\`\`tikz\n${element.content || ""}\n\`\`\``;
        },
      },
      {
        type: "typst",
        isBlock: true,
        toMarkdown: (element) => {
          return `\`\`\`typst\n${element.content || ""}\n\`\`\``;
        },
      },
      {
        type: "callout",
        isBlock: true,
        toMarkdown: (element, childrenStr) => {
          const title = element.title
            ? ` title="${element.title}"`
            : ` title=${DEFAULT_TITLE[element.calloutType as keyof typeof DEFAULT_TITLE]}`;
          const type = element.calloutType || "note";
          return `:::${type}{${title}}\n${childrenStr}\n:::`;
        },
        toMarkdownStructured: (element, childrenStr) => {
          const title = element.title
            ? ` title="${element.title}"`
            : ` title=${DEFAULT_TITLE[element.calloutType as keyof typeof DEFAULT_TITLE]}`;
          const type = element.calloutType || "note";
          return {
            output: `:::${type}{${title}}\n${childrenStr}\n:::`,
            childrenStart: { line: 1, ch: 0 },
          };
        },
      },
      {
        type: "detail",
        isBlock: true,
        toMarkdown: (element, childrenStr) => {
          const attributes = [];
          if (element.title) {
            attributes.push(`title="${element.title}"`);
          }
          if (element.open) {
            attributes.push(`open=true`);
          }
          const attributeStr =
            attributes.length > 0 ? attributes.join(" ") : "";
          return `:::detail{${attributeStr}}\n${childrenStr}\n:::`;
        },
        toMarkdownStructured: (element, childrenStr) => {
          const attributes = [];
          if (element.title) {
            attributes.push(`title="${element.title}"`);
          }
          if (element.open) {
            attributes.push(`open=true`);
          }
          const attributeStr =
            attributes.length > 0 ? attributes.join(" ") : "";
          return {
            output: `:::detail{${attributeStr}}\n${childrenStr}\n:::`,
            childrenStart: { line: 1, ch: 0 },
          };
        },
      },
      {
        type: "divide-line",
        isBlock: true,
        toMarkdown: () => "---",
      },
      {
        type: "video",
        isBlock: true,
        toMarkdown: (element) => {
          const attributes = [];
          attributes.push(`src="${element.src}"`);
          if (element.playbackRate)
            attributes.push(`playbackRate="${element.playbackRate}"`);
          if (element.metaInfo) {
            const metaInfoStr = btoa(
              unescape(encodeURIComponent(JSON.stringify(element.metaInfo))),
            );
            attributes.push(`metaInfo="${metaInfoStr}"`);
          }
          if (element.width) attributes.push(`width="${element.width}"`);
          if (element.align) attributes.push(`align="${element.align}"`);
          const attributeStr =
            attributes.length > 0 ? attributes.join(" ") : "";
          return `:::video{${attributeStr}}\n:::`;
        },
      },
      {
        type: "audio",
        isBlock: true,
        toMarkdown: (element) => {
          const attributes = [];
          attributes.push(`src="${element.src}"`);
          if (element.isFromGenerate)
            attributes.push(`isFromGenerate="${element.isFromGenerate}"`);
          if (element.audioText)
            attributes.push(`audioText="${element.audioText}"`);
          const attributeStr =
            attributes.length > 0 ? attributes.join(" ") : "";
          return `:::audio{${attributeStr}}\n:::`;
        },
      },
      {
        type: "file-attachment",
        isBlock: true,
        toMarkdown: (element) => {
          const attributes = [];
          attributes.push(`fileName="${element.fileName}"`);
          attributes.push(`filePath="${element.filePath}"`);
          if (element.localFilePath)
            attributes.push(`localFilePath="${element.localFilePath}"`);
          attributes.push(`isLocal=${element.isLocal}`);
          attributes.push(`uuid="${element.uuid}"`);
          const attributeStr = attributes.join(" ");
          return `:::file-attachment{${attributeStr}}\n:::`;
        },
      },
      {
        type: "check-list",
        isBlock: true,
        toMarkdown: (_element, childrenStr) => {
          return childrenStr.split("\n").filter(Boolean).join("\n");
        },
      },
      {
        type: "check-list-item",
        isBlock: true,
        toMarkdown: (element, childrenStr) => {
          const prefix = element.checked ? "- [x] " : "- [ ] ";
          const lines = childrenStr.trim().split("\n");
          if (lines.length > 1) {
            return (
              prefix +
              lines[0] +
              "\n" +
              lines
                .slice(1)
                .filter(Boolean)
                .map((line) => `  ${line}`)
                .join("\n")
            );
          }
          return prefix + lines[0];
        },
        toMarkdownStructured: (element, childrenStr) => {
          const prefix = element.checked ? "- [x] " : "- [ ] ";
          const lines = childrenStr.trim().split("\n");
          let output: string;

          if (lines.length > 1) {
            output =
              prefix +
              lines[0] +
              "\n" +
              lines
                .slice(1)
                .filter(Boolean)
                .map((line) => `  ${line}`)
                .join("\n");
          } else {
            output = prefix + lines[0];
          }

          return {
            output,
            childrenStart: { line: 0, ch: prefix.length },
            perLineOffset: 2, // 后续行缩进 2 个空格
          };
        },
      },
      {
        type: "highlight-block",
        isBlock: true,
        toMarkdown: (element, childrenStr) => {
          const color = element.color || "default";
          return `:::highlight-block{color=${color}}\n${childrenStr}\n:::`;
        },
        toMarkdownStructured: (element, childrenStr) => {
          const color = element.color || "default";
          return {
            output: `:::highlight-block{color=${color}}\n${childrenStr}\n:::`,
            childrenStart: { line: 1, ch: 0 },
          };
        },
      },
      {
        type: "custom-block",
        isBlock: true,
        toMarkdown: (element) => {
          return `\`\`\`custom-block\n${element.content}\n\`\`\``;
        },
      },
      {
        type: "webview",
        isBlock: true,
        toMarkdown: (element) => {
          return `<iframe src="${element.url}" width="100%" height="${element.height}" frameborder="0"></iframe>`;
        },
      },
      {
        type: "front-matter",
        isBlock: true,
        toMarkdown: (node) => {
          return `---\n${node.value}\n---`;
        },
      },
      {
        type: "emoji",
        toMarkdown: (element) => {
          return `${element.nativeEmoji || element.emoji}`;
        },
      },
      {
        type: "annotation",
        toMarkdown: (element) => {
          const footnoteId = this.addFootnote(element.content || "");
          return `[^${footnoteId}]`;
        },
      },
      {
        type: "underline",
        toMarkdown: (element, childrenStr) => {
          const attributes = [];
          if (element.color) attributes.push(`color=${element.color}`);
          if (element.lineType) attributes.push(`lineType=${element.lineType}`);
          const attributeStr =
            attributes.length > 0 ? `{${attributes.join(" ")}}` : "";
          return `:underline[${childrenStr}]${attributeStr}`;
        },
        toMarkdownStructured: (element, childrenStr) => {
          const attributes = [];
          if (element.color) attributes.push(`color=${element.color}`);
          if (element.lineType) attributes.push(`lineType=${element.lineType}`);
          const attributeStr =
            attributes.length > 0 ? `{${attributes.join(" ")}}` : "";
          return {
            output: `:underline[${childrenStr}]${attributeStr}`,
            childrenStart: { line: 0, ch: ":underline[".length },
          };
        },
      },
      {
        type: "chat-reference",
        isBlock: true,
        toMarkdown: (element) => {
          const attributes = [];
          attributes.push(`chatId=${element.chatId}`);
          if (element.title) attributes.push(`title="${element.title}"`);
          if (element.height) attributes.push(`height=${element.height}`);
          const attributeStr = attributes.join(" ");
          return `::chat-reference{${attributeStr}}`;
        },
      },
      {
        type: "summary-timestamp",
        isBlock: false,
        toMarkdown: (element) => {
          return `:time{start=${element.start} end=${element.end}}`;
        },
      },
      {
        type: "chart",
        isBlock: true,
        toMarkdown: (element) => {
          const dataStr = btoa(
            unescape(encodeURIComponent(JSON.stringify(element.data))),
          );
          const configStr = btoa(
            unescape(encodeURIComponent(JSON.stringify(element.config))),
          );
          return `:::chart{data="${dataStr}" config="${configStr}"}\n:::`;
        },
      },
    ]);
  }
}

export const markdownSerializerRegistry = new MarkdownSerializerRegistry();
