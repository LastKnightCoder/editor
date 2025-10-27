import { markdownTable } from "markdown-table";
import { CustomElement } from "@editor/types";
import { trim } from "lodash";

const DEFAULT_TITLE = {
  tip: "技巧",
  info: "信息",
  warning: "警告",
  danger: "危险",
  note: "注意",
};

export interface MarkdownSerializer {
  type: string;
  isBlock?: boolean;
  toMarkdown: (
    element: any,
    childrenStr: string,
    parentElement?: any,
  ) => string;
}

export class MarkdownSerializerRegistry {
  private serializers: MarkdownSerializer[] = [];
  private blockTypes: Set<string> = new Set();
  private footnoteCounter = 0;
  private footnoteDefinitions: Map<number, string> = new Map();

  constructor() {
    this.registerDefaultSerializers();
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
      },
      {
        type: "header",
        isBlock: true,
        toMarkdown: (element, childrenStr) => {
          const level = element.level || 1;
          const hashes = "#".repeat(level);
          return `${hashes} ${childrenStr}`;
        },
      },
      {
        type: "link",
        toMarkdown: (element, childrenStr) => {
          return `[${childrenStr}](${element.url})`;
        },
      },
      {
        type: "code-block",
        isBlock: true,
        toMarkdown: (element) => {
          const language = element.language || "";
          return `\`\`\`${language}\n${element.code || ""}\n\`\`\``;
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
          if (parentElement.type === "bulleted-list") {
            // children 按照 \n 分割，第一行加上 -，其它行加上两个空格
            return children
              .trim()
              .split("\n")
              .map((child, index) => {
                if (index === 0) {
                  return `- ${child}`;
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
      },
      {
        type: "table",
        isBlock: true,
        toMarkdown: (_element, children) => {
          const rows = children.split("\n");
          const data = rows
            .filter(trim)
            .map((row) => row.split("|").filter(trim));
          return markdownTable(data);
        },
      },
      {
        type: "table-row",
        isBlock: true,
        toMarkdown: (_element, children) => {
          return `| ${children.split("\n").join("")}`.trim();
        },
      },
      {
        type: "table-cell",
        toMarkdown: (_element, children) => {
          return `${children.trim()} | `;
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
          return `<video src="${element.url}" controls></video>`;
        },
      },
      {
        type: "audio",
        isBlock: true,
        toMarkdown: (element) => {
          return `<audio src="${element.url}" controls></audio>`;
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
      },
      {
        type: "highlight-block",
        isBlock: true,
        toMarkdown: (element, childrenStr) => {
          const color = element.color || "default";
          return `:::highlight-block{color=${color}}\n${childrenStr}\n:::`;
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
          return `:${element.nativeEmoji || element.emoji}:`;
        },
      },
      {
        type: "annotation",
        toMarkdown: (element) => {
          const footnoteId = this.addFootnote(element.content || "");
          return `[^${footnoteId}]`;
        },
      },
    ]);
  }
}

export const markdownSerializerRegistry = new MarkdownSerializerRegistry();
