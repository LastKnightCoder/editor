import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkDirective from "remark-directive";
import remarkRehype from "remark-rehype";
import remarkFrontmatter from "remark-frontmatter";
import { Descendant } from "slate";
import { v4 as uuid } from "uuid";
import { visit } from "unist-util-visit";
import {
  AudioElement,
  HTMLBlockElement,
  ImageElement,
  VideoElement,
  HighlightColor,
} from "@tau/editor/src";
import {
  ElementMapping,
  MarkdownPosition,
  PositionMapper,
  TextMapping,
} from "./positionMapper";
import { FileAttachmentElement } from "../editor-extensions/file-attachment/types";

export {
  markdownSerializerRegistry,
  type MarkdownSerializer,
} from "./markdownSerializerRegistry";

export {
  getMarkdown,
  elementToMarkdown,
  leafToMarkdown,
} from "./markdown-helper";

export interface SlateWithPositions {
  content: Descendant[];
  positionMap: PositionMapper;
}

const remarkHtmlProcessor = () => (tree: any) => {
  // 第一次遍历：合并连续的 HTML 节点
  let htmlBuffer: { node: any; parent: any }[] = [];
  visit(tree, "html", (node, _, parent) => {
    if (htmlBuffer.length === 0) {
      htmlBuffer.push({ node, parent });
    } else {
      const last = htmlBuffer[htmlBuffer.length - 1];
      if (last.parent === parent) {
        htmlBuffer.push({ node, parent });
      } else {
        processBuffer(htmlBuffer);
        htmlBuffer = [{ node, parent }];
      }
    }
  });

  // 处理剩余的缓冲
  if (htmlBuffer.length > 0) {
    processBuffer(htmlBuffer);
  }

  // 第二次遍历：判断 HTML 类型并调整结构
  visit(tree, (node) => {
    if (node.type === "html") {
      const isBlockHtml = node.value.match(/^<(div|p|table|ul|ol|h[1-6])/i);
      const parentIsParagraph = node.parent?.type === "paragraph";

      // 添加类型标记
      node.htmlType = isBlockHtml ? "block" : "inline";

      // 处理块级 HTML 的段落包裹问题
      if (node.htmlType === "block" && parentIsParagraph) {
        const paragraphIndex = node.parent.children.indexOf(node);
        node.parent.children.splice(paragraphIndex, 1);
        const rootIndex = tree.children.indexOf(node.parent);
        tree.children.splice(rootIndex + 1, 0, node);
      }
    }
  });
};

function processBuffer(buffer: any[]) {
  if (buffer.length < 2) return;

  const nodes = buffer.map((b) => b.node);
  const parent = buffer[0].parent;
  const startIndex = parent.children.indexOf(nodes[0]);

  // 合并 HTML 内容
  const mergedValue = nodes.map((n) => n.value).join("\n");

  // 创建新节点
  const mergedNode = {
    type: "html",
    value: mergedValue,
    position: {
      start: nodes[0].position.start,
      end: nodes[nodes.length - 1].position.end,
    },
  };

  // 替换原节点
  parent.children.splice(startIndex, nodes.length, mergedNode);
}

const markdownToDescendant = (
  node: any,
  parentAstNode: any,
  astChildrenOfParent: any[],
): Descendant | Descendant[] | null => {
  if (node.type === "heading") {
    return {
      type: "header",
      level: node.depth,
      children: [],
    };
  } else if (node.type === "paragraph") {
    return {
      type: "paragraph",
      children: [],
    };
  } else if (node.type === "html") {
    if (node.htmlType === "inline") {
      return {
        type: "html-inline",
        html: node.value,
        openEdit: false,
        children: [
          {
            type: "formatted",
            text: "",
          },
        ],
      };
    }
    return {
      type: "html-block",
      html: node.value,
      children: [
        {
          type: "formatted",
          text: "",
        },
      ],
    };
  } else if (node.type === "list") {
    return {
      type: node.ordered ? "numbered-list" : "bulleted-list",
      children: [],
    };
  } else if (node.type === "listItem") {
    const listItemElement: any = {
      type: "list-item",
      children: [],
    };

    // Extract icon from the first paragraph's first image node if it uses custom protocol
    if (node.children && node.children.length > 0) {
      const firstChild = node.children[0];
      if (
        firstChild.type === "paragraph" &&
        firstChild.children &&
        firstChild.children.length > 0
      ) {
        const firstNode = firstChild.children[0];

        // Check if the first node is an image with custom protocol
        if (firstNode.type === "image") {
          const url = firstNode.url || "";

          // Match emoji protocol: emoji: or emoji://
          if (url.startsWith("emoji:") || url.startsWith("emoji://")) {
            const emoji = url.replace(/^emoji:\/?\/?/, "");
            listItemElement.icon = emoji;
            listItemElement.iconType = "emoji";

            // Remove this image node from children
            firstChild.children.shift();
          }
          // Match list icon protocol: list-icon: or list-icon://
          else if (
            url.startsWith("list-icon:") ||
            url.startsWith("list-icon://")
          ) {
            const imageUrl = url.replace(/^list-icon:\/?\/?/, "");
            listItemElement.iconUrl = imageUrl;
            listItemElement.iconType = "image";

            // Remove this image node from children
            firstChild.children.shift();
          }
        }
      }
    }

    return listItemElement;
  } else if (node.type === "code") {
    if (node.lang?.trim?.() === "custom-block") {
      return {
        type: "custom-block",
        content: node.value,
        children: [
          {
            type: "formatted",
            text: "",
          },
        ],
      };
    } else if (node.lang?.trim?.()?.toLowerCase?.() === "mermaid") {
      return {
        type: "mermaid",
        chart: node.value,
        children: [
          {
            type: "formatted",
            text: "",
          },
        ],
      };
    } else if (node.lang?.trim?.()?.toLowerCase?.() === "abc") {
      return {
        type: "abc",
        content: node.value,
        children: [
          {
            type: "formatted",
            text: "",
          },
        ],
      };
    } else if (node.lang?.trim?.()?.toLowerCase?.() === "plantuml") {
      return {
        type: "plantuml",
        content: node.value,
        children: [
          {
            type: "formatted",
            text: "",
          },
        ],
      };
    } else if (node.lang?.trim?.()?.toLowerCase?.() === "tikz") {
      return {
        type: "tikz",
        content: node.value,
        children: [
          {
            type: "formatted",
            text: "",
          },
        ],
      };
    } else if (node.lang?.trim?.()?.toLowerCase?.() === "typst") {
      return {
        type: "typst",
        content: node.value,
        children: [
          {
            type: "formatted",
            text: "",
          },
        ],
      };
    }
    return {
      type: "code-block",
      language: node.lang?.trim?.()?.toUpperCase?.() || "",
      code: node.value,
      uuid: uuid(),
      children: [
        {
          type: "formatted",
          text: "",
        },
      ],
    };
  } else if (node.type === "blockquote") {
    return {
      type: "blockquote",
      children: [],
    };
  } else if (node.type === "math") {
    return {
      type: "block-math",
      tex: node.value,
      children: [
        {
          type: "formatted",
          text: "",
        },
      ],
    };
  } else if (node.type === "table") {
    return {
      type: "table",
      children: [],
    };
  } else if (node.type === "tableRow") {
    return {
      type: "table-row",
      children: [],
    };
  } else if (node.type === "tableCell") {
    return {
      type: "table-cell",
      children: [],
    };
  } else if (node.type === "containerDirective") {
    if (["note", "tip", "warning", "info", "danger"].includes(node.name)) {
      return {
        type: "callout",
        title: node.attributes.title || "",
        calloutType: node.name,
        children: [],
      };
    } else if (node.name === "highlight-block") {
      return {
        type: node.name,
        color: node.attributes.color || "red",
        children: [],
      };
    } else if (node.name === "detail") {
      return {
        type: "detail",
        title: node.attributes.title || "DETAIL",
        open: node.attributes.open === "true" || node.attributes.open === true,
        children: [],
      };
    } else if (node.name === "underline") {
      return {
        type: "underline",
        color: node.attributes.color || "default",
        lineType: node.attributes.lineType || "solid",
        colorSelectOpen: false,
        children: [],
      };
    } else if (node.name === "video") {
      const element: VideoElement = {
        type: "video",
        src: node.attributes.src || "",
        uploading: false,
        children: [{ type: "formatted", text: "" }],
      };
      if (node.attributes.playbackRate)
        element.playbackRate = parseFloat(node.attributes.playbackRate);
      if (node.attributes.metaInfo) {
        try {
          element.metaInfo = JSON.parse(atob(node.attributes.metaInfo));
        } catch (e) {
          // ignore invalid metaInfo
        }
      }
      if (node.attributes.width)
        element.width = parseInt(node.attributes.width);
      if (node.attributes.align) element.align = node.attributes.align;
      return element;
    } else if (node.name === "audio") {
      const element: AudioElement = {
        type: "audio",
        src: node.attributes.src || "",
        uploading: false,
        children: [{ type: "formatted", text: "" }],
      };
      if (node.attributes.isFromGenerate)
        element.isFromGenerate = node.attributes.isFromGenerate === "true";
      if (node.attributes.audioText)
        element.audioText = node.attributes.audioText;
      return element;
    } else if (node.name === "file-attachment") {
      const element: FileAttachmentElement = {
        type: "file-attachment",
        fileName: node.attributes.fileName || "",
        filePath: node.attributes.filePath || "",
        localFilePath: node.attributes.localFilePath,
        isLocal:
          node.attributes.isLocal === "true" ||
          node.attributes.isLocal === true,
        uuid: node.attributes.uuid || uuid(),
      };
      return {
        ...element,
        children: [{ type: "formatted", text: "" }],
      } as unknown as Descendant;
    } else if (node.name === "chart") {
      try {
        const data = JSON.parse(atob(node.attributes.data || "W10="));
        const config = JSON.parse(atob(node.attributes.config || "e30="));
        return {
          type: "chart",
          data,
          config,
          children: [{ type: "formatted", text: "" }],
        };
      } catch {
        return null;
      }
    } else {
      return null;
    }
  } else if (node.type === "inlineMath") {
    return {
      type: "inline-math",
      tex: node.value,
      children: [
        {
          type: "formatted",
          text: "",
        },
      ],
    };
  } else if (node.type === "image") {
    const isOnlyChildInParagraph =
      parentAstNode &&
      parentAstNode.type === "paragraph" &&
      astChildrenOfParent &&
      astChildrenOfParent.length === 1 &&
      astChildrenOfParent[0] === node;

    if (isOnlyChildInParagraph) {
      return {
        type: "image",
        url: node.url,
        alt: node.alt,
        children: [
          {
            type: "formatted",
            text: "",
          },
        ],
      };
    } else {
      return {
        type: "inline-image",
        url: node.url,
        alt: node.alt,
        uuid: uuid(),
        children: [
          {
            type: "formatted",
            text: "",
          },
        ],
      };
    }
  } else if (node.type === "link") {
    return {
      type: "link",
      url: node.url,
      children: [],
    };
  } else if (node.type === "text") {
    return {
      type: "formatted",
      text: node.value,
    };
  } else if (node.type === "leafDirective") {
    const attributes = node.attributes || {};
    if (node.name === "chat-reference") {
      return {
        type: "chat-reference",
        chatId: parseInt(attributes.chatId) || 0,
        title: attributes.title || "未命名对话",
        height: attributes.height ? parseInt(attributes.height) : 400,
        children: [
          {
            type: "formatted",
            text: "",
          },
        ],
      };
    }
    return {
      type: "formatted",
      text: `::${node.name}`,
    };
  } else if (node.type === "textDirective") {
    const attributes = node.attributes || {};
    const color = attributes.color || "";
    const darkColor = attributes.darkColor || "";
    if (node.name === "color") {
      const colorAttributes = { color, darkColor };
      return node.children
        .map(markdownToDescendant)
        .filter(Boolean)
        .map((item: Descendant | Descendant[]) => {
          if (Array.isArray(item)) {
            return item
              .map((i) => {
                if (i.type !== "formatted") return undefined;
                return { ...i, ...colorAttributes };
              })
              .filter(Boolean) as Descendant[];
          }
          if (item.type !== "formatted") return item;
          return { ...item, ...colorAttributes };
        })
        .filter(Boolean)
        .flat() as Descendant[];
    } else if (node.name === "highlight") {
      const highlightColor = attributes.color || "yellow";
      return node.children
        .map(markdownToDescendant)
        .filter(Boolean)
        .map((item: Descendant | Descendant[]) => {
          if (Array.isArray(item)) {
            return item
              .map((i) => {
                if (i.type !== "formatted") return undefined;
                return { ...i, highlight: highlightColor };
              })
              .filter(Boolean) as Descendant[];
          }
          if (item.type !== "formatted") return item;
          return { ...item, highlight: highlightColor };
        })
        .filter(Boolean)
        .flat() as Descendant[];
    } else if (node.name === "underline") {
      return {
        type: "underline",
        color: attributes.color || "default",
        lineType: attributes.lineType || "solid",
        colorSelectOpen: false,
        children: [],
      };
    } else if (node.name === "content-link") {
      const rawTitle = attributes.title || attributes.contentTitle || "";
      const contentTitle =
        typeof rawTitle === "string" ? rawTitle.replace(/&quot;/g, '"') : "";
      return {
        type: "content-link",
        refId: parseInt(attributes.refId || "0", 10),
        contentId: parseInt(attributes.contentId || "0", 10),
        contentType: attributes.contentType || "",
        contentTitle,
        children: [
          {
            type: "formatted",
            text: "",
          },
        ],
      } as unknown as Descendant;
    } else if (node.name === "time") {
      return {
        type: "summary-timestamp",
        start: parseInt(attributes.start || "0", 10),
        end: parseInt(attributes.end || "0", 10),
        children: [{ type: "formatted", text: "" }],
      } as unknown as Descendant;
    }
    return {
      type: "formatted",
      text: `:${node.name}`,
    };
  } else if (node.type === "inlineCode") {
    return {
      type: "formatted",
      text: node.value,
      code: true,
    };
  } else if (["strong", "emphasis", "delete"].includes(node.type)) {
    const attributes: {
      bold?: boolean;
      italic?: boolean;
      strikethrough?: boolean;
    } = {};
    if (node.type === "strong") {
      attributes.bold = true;
    } else if (node.type === "emphasis") {
      attributes.italic = true;
    } else if (node.type === "delete") {
      attributes.strikethrough = true;
    }
    return node.children
      .map(markdownToDescendant)
      .filter(Boolean)
      .map((item: Descendant | Descendant[]) => {
        if (Array.isArray(item)) {
          return item
            .map((i) => {
              if (i.type !== "formatted") return;
              return {
                ...i,
                ...attributes,
              };
            })
            .filter(Boolean) as Descendant[];
        }
        if (item.type !== "formatted") return;
        return {
          ...item,
          ...attributes,
        };
      })
      .filter(Boolean)
      .flat() as Descendant[];
  } else if (node.type === "break" || node.type === "thematicBreak") {
    return {
      type: "divide-line",
      children: [
        {
          type: "formatted",
          text: "",
        },
      ],
    };
  } else if (node.type === "yaml") {
    return {
      type: "front-matter",
      value: node.value,
      children: [
        {
          type: "formatted",
          text: "",
        },
      ],
    };
  } else if (node.type === "footnoteReference") {
    // 将脚注引用转换为 annotation
    const content = footnoteDefinitionsMap.get(node.identifier) || "";
    return {
      type: "annotation",
      content,
      children: [
        {
          type: "formatted",
          text: "",
        },
      ],
    };
  } else if (node.type === "footnoteDefinition") {
    // 脚注定义已经在第一次遍历中处理了，这里忽略
    return null;
  } else {
    console.log("unknown node", node);
    if (
      parentAstNode &&
      (parentAstNode.type === "paragraph" ||
        parentAstNode.type === "link" ||
        parentAstNode.type === "heading")
    ) {
      return {
        type: "formatted",
        text: node.value || "",
      };
    }
    return {
      type: "paragraph",
      children: [
        {
          type: "formatted",
          text: node.value,
        },
      ],
    };
  }
};

// 全局脚注定义映射
const footnoteDefinitionsMap: Map<string, string> = new Map();

// 提取节点中的文本内容
const extractTextFromNode = (node: any): string => {
  if (node.type === "text") {
    return node.value;
  }
  if (node.children) {
    return node.children.map(extractTextFromNode).join("");
  }
  return "";
};

type MarkContext = {
  bold?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
  code?: boolean;
  color?: string;
  darkColor?: string;
  highlight?: boolean | HighlightColor;
};

const applyMarks = (node: Descendant, marks: MarkContext): Descendant => {
  if (node.type !== "formatted") return node;
  return {
    ...node,
    ...marks,
  };
};

const toMarkdownPosition = (point?: {
  line?: number;
  column?: number;
}): MarkdownPosition => {
  return {
    line: Math.max(0, (point?.line ?? 1) - 1),
    ch: Math.max(0, (point?.column ?? 1) - 1),
  };
};

const getOffset = (point?: { offset?: number }): number | null => {
  return typeof point?.offset === "number" ? point.offset : null;
};

const getRangeLength = (
  start?: { line?: number; column?: number; offset?: number },
  end?: { line?: number; column?: number; offset?: number },
  fallback = 0,
): number => {
  const startOffset = getOffset(start);
  const endOffset = getOffset(end);
  if (startOffset !== null && endOffset !== null) {
    return Math.max(0, endOffset - startOffset);
  }
  if (start?.line === end?.line && start?.column && end?.column) {
    return Math.max(0, end.column - start.column);
  }
  return fallback;
};

const isPathInNodes = (nodes: Descendant[], path: number[]): boolean => {
  let current: any = { children: nodes };
  for (const index of path) {
    if (!current.children || index < 0 || index >= current.children.length) {
      return false;
    }
    current = current.children[index];
  }
  return true;
};

const buildTextMapping = (params: {
  slateTextPath: number[];
  text: string;
  textPosition?: {
    start?: { line?: number; column?: number; offset?: number };
    end?: { line?: number; column?: number; offset?: number };
  };
  wrapperPosition?: {
    start?: { line?: number; column?: number; offset?: number };
    end?: { line?: number; column?: number; offset?: number };
  };
  prefixLengthOverride?: number;
  suffixLengthOverride?: number;
}): TextMapping | null => {
  const { slateTextPath, text, textPosition, wrapperPosition } = params;
  if (!textPosition?.start || !textPosition?.end) return null;

  const wrapper = wrapperPosition ?? textPosition;
  if (!wrapper.start || !wrapper.end) return null;

  const textStartOffset = getOffset(textPosition.start);
  const textEndOffset = getOffset(textPosition.end);
  const wrapperStartOffset = getOffset(wrapper.start);
  const wrapperEndOffset = getOffset(wrapper.end);

  let prefixLength = 0;
  let suffixLength = 0;

  if (typeof params.prefixLengthOverride === "number") {
    prefixLength = params.prefixLengthOverride;
  } else if (textStartOffset !== null && wrapperStartOffset !== null) {
    prefixLength = Math.max(0, textStartOffset - wrapperStartOffset);
  } else if (wrapper.start.line === textPosition.start.line) {
    prefixLength = Math.max(
      0,
      (textPosition.start.column ?? 1) - (wrapper.start.column ?? 1),
    );
  }

  if (typeof params.suffixLengthOverride === "number") {
    suffixLength = params.suffixLengthOverride;
  } else if (textEndOffset !== null && wrapperEndOffset !== null) {
    suffixLength = Math.max(0, wrapperEndOffset - textEndOffset);
  } else if (wrapper.end.line === textPosition.end.line) {
    suffixLength = Math.max(
      0,
      (wrapper.end.column ?? 1) - (textPosition.end.column ?? 1),
    );
  }

  const mdLength = getRangeLength(
    wrapper.start,
    wrapper.end,
    prefixLength + text.length + suffixLength,
  );

  return {
    type: "text",
    slateTextPath,
    slateOffset: 0,
    slateLength: text.length,
    mdLine: toMarkdownPosition(wrapper.start).line,
    mdCh: toMarkdownPosition(wrapper.start).ch,
    mdLength: Math.max(mdLength, prefixLength + text.length + suffixLength),
    prefixLength,
    suffixLength,
  };
};

const isVoidSlateElementType = (type: string): boolean => {
  const voidTypes = new Set([
    "code-block",
    "image",
    "inline-image",
    "video",
    "audio",
    "file-attachment",
    "whiteboard",
    "block-math",
    "inline-math",
    "mermaid",
    "tikz",
    "typst",
    "plantuml",
    "abc",
    "graphviz",
    "divide-line",
    "webview",
    "front-matter",
  ]);
  return voidTypes.has(type);
};

/**
 * Markdown 导入（带位置映射）
 */
export const importFromMarkdownWithPositions = (
  markdown: string,
  ignoreTypes: string[] = [],
): SlateWithPositions => {
  // 重置脚注定义映射
  footnoteDefinitionsMap.clear();

  const markdownLines = markdown.split("\n");
  const positionMap = new PositionMapper();

  const parseResult = unified()
    .use(remarkParse)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(remarkHtmlProcessor)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkDirective)
    .use(remarkFrontmatter, ["yaml"])
    .parse(markdown);

  // 首次遍历：收集所有脚注定义
  const collectFootnoteDefinitions = (nodes: typeof parseResult.children) => {
    for (const node of nodes) {
      if (node.type === "footnoteDefinition") {
        const content = extractTextFromNode(node);
        footnoteDefinitionsMap.set(node.identifier, content);
      }
    }
  };

  collectFootnoteDefinitions(parseResult.children);

  const editor: Descendant[] = [];

  const dfsWithPositions = (
    astNodes: any[],
    slateResultArray: Descendant[],
    ignoreTypes: string[] = [],
    parentAstNodeForChildren: any | null = null,
    parentPath: number[] = [],
    markContext: MarkContext = {},
    wrapperPosition?: {
      start?: { line?: number; column?: number; offset?: number };
      end?: { line?: number; column?: number; offset?: number };
    },
  ) => {
    for (const astChildNode of astNodes) {
      while (
        astChildNode.type === "link" &&
        astChildNode.children &&
        astChildNode.children.some((c: any) => c.type === "html")
      ) {
        const index = astChildNode.children.findIndex(
          (child: any) => child.type === "html",
        );
        const paragraph = astChildNode.children[index];
        paragraph.type = "text";
      }

      if (ignoreTypes.includes(astChildNode.type)) continue;

      if (astChildNode.type === "strong") {
        dfsWithPositions(
          astChildNode.children || [],
          slateResultArray,
          ignoreTypes,
          astChildNode,
          parentPath,
          { ...markContext, bold: true },
          astChildNode.position,
        );
        continue;
      }

      if (astChildNode.type === "emphasis") {
        dfsWithPositions(
          astChildNode.children || [],
          slateResultArray,
          ignoreTypes,
          astChildNode,
          parentPath,
          { ...markContext, italic: true },
          astChildNode.position,
        );
        continue;
      }

      if (astChildNode.type === "delete") {
        dfsWithPositions(
          astChildNode.children || [],
          slateResultArray,
          ignoreTypes,
          astChildNode,
          parentPath,
          { ...markContext, strikethrough: true },
          astChildNode.position,
        );
        continue;
      }

      if (astChildNode.type === "textDirective") {
        if (astChildNode.name === "color") {
          const attributes = astChildNode.attributes || {};
          dfsWithPositions(
            astChildNode.children || [],
            slateResultArray,
            ignoreTypes,
            astChildNode,
            parentPath,
            {
              ...markContext,
              color: attributes.color || "",
              darkColor: attributes.darkColor || "",
            },
            wrapperPosition,
          );
          continue;
        }

        if (astChildNode.name === "highlight") {
          const attributes = astChildNode.attributes || {};
          dfsWithPositions(
            astChildNode.children || [],
            slateResultArray,
            ignoreTypes,
            astChildNode,
            parentPath,
            {
              ...markContext,
              highlight: attributes.color || "yellow",
            },
            wrapperPosition,
          );
          continue;
        }
      }

      if (astChildNode.type === "text") {
        const slateNode: Descendant = {
          type: "formatted",
          text: astChildNode.value || "",
          ...markContext,
        };

        const insertIndex = slateResultArray.length;
        slateResultArray.push(slateNode);
        const slatePath = [...parentPath, insertIndex];

        const mapping = buildTextMapping({
          slateTextPath: slatePath,
          text: astChildNode.value || "",
          textPosition: astChildNode.position,
          wrapperPosition,
        });
        if (mapping) {
          positionMap.addTextMapping(mapping);
        }
        continue;
      }

      if (astChildNode.type === "inlineCode") {
        const slateNode: Descendant = {
          type: "formatted",
          text: astChildNode.value || "",
          ...markContext,
          code: true,
        };

        const insertIndex = slateResultArray.length;
        slateResultArray.push(slateNode);
        const slatePath = [...parentPath, insertIndex];

        const totalLength = getRangeLength(
          astChildNode.position?.start,
          astChildNode.position?.end,
          astChildNode.value?.length ?? 0,
        );
        const extra = Math.max(
          0,
          totalLength - (astChildNode.value?.length ?? 0),
        );
        const prefixLength = Math.floor(extra / 2);
        const suffixLength = extra - prefixLength;

        const mapping = buildTextMapping({
          slateTextPath: slatePath,
          text: astChildNode.value || "",
          textPosition: astChildNode.position,
          wrapperPosition: astChildNode.position,
          prefixLengthOverride: prefixLength,
          suffixLengthOverride: suffixLength,
        });
        if (mapping) {
          positionMap.addTextMapping(mapping);
        }
        continue;
      }

      const slateNode = markdownToDescendant(
        astChildNode,
        parentAstNodeForChildren,
        astNodes,
      );

      if (!slateNode) continue;

      const nodesToInsert = Array.isArray(slateNode)
        ? slateNode.map((node) => applyMarks(node, markContext))
        : [applyMarks(slateNode, markContext)];

      for (const node of nodesToInsert) {
        const insertIndex = slateResultArray.length;
        slateResultArray.push(node);
        const slatePath = [...parentPath, insertIndex];

        if (node.type === "formatted") {
          const mapping = buildTextMapping({
            slateTextPath: slatePath,
            text: (node as any).text || "",
            textPosition: astChildNode.position,
            wrapperPosition,
          });
          if (mapping) {
            positionMap.addTextMapping(mapping);
          }
        } else if (astChildNode.position && isVoidSlateElementType(node.type)) {
          const mdStart = toMarkdownPosition(astChildNode.position.start);
          const mdEnd = toMarkdownPosition(astChildNode.position.end);
          const elementMapping: ElementMapping = {
            type: "element",
            slateElementPath: slatePath,
            elementType: node.type,
            isVoid: true,
            mdStartLine: mdStart.line,
            mdStartCh: mdStart.ch,
            mdEndLine: mdEnd.line,
            mdEndCh: mdEnd.ch,
          };

          if (node.type === "code-block" && astChildNode.type === "code") {
            const code = astChildNode.value || "";
            const lines = code.split("\n");
            const codeStartLine = mdStart.line + 1;
            const codeEndLine = codeStartLine + Math.max(0, lines.length - 1);
            const firstCodeLine = lines[0] ?? "";
            const firstLineIndex = astChildNode.position?.start?.line ?? 1;
            const rawLine = markdownLines[firstLineIndex] ?? "";
            let prefixCh = 0;
            if (firstCodeLine.length === 0) {
              prefixCh = rawLine.length;
            } else {
              const idx = rawLine.indexOf(firstCodeLine);
              prefixCh = idx >= 0 ? idx : 0;
            }
            const codeEndCh =
              lines.length > 0
                ? prefixCh + lines[lines.length - 1].length
                : prefixCh;
            elementMapping.propertyMappings = {
              code: {
                mdStartLine: codeStartLine,
                mdStartCh: prefixCh,
                mdEndLine: codeEndLine,
                mdEndCh: codeEndCh,
              },
            };
          }

          positionMap.addElementMapping(elementMapping);
        }

        if (astChildNode.children && node.type !== "formatted") {
          const nextWrapper =
            astChildNode.type === "link" ||
            (astChildNode.type === "textDirective" &&
              (astChildNode.name === "underline" ||
                astChildNode.name === "content-link"))
              ? astChildNode.position
              : wrapperPosition;

          dfsWithPositions(
            astChildNode.children,
            (node as any).children,
            ignoreTypes,
            astChildNode,
            slatePath,
            markContext,
            nextWrapper,
          );
        }
      }
    }
  };

  const extendedIgnoreTypes = [...ignoreTypes, "footnoteDefinition"];
  dfsWithPositions(
    parseResult.children,
    editor,
    extendedIgnoreTypes,
    parseResult,
    [],
  );

  let beforeNormalize = editor;
  let afterNormalize = normalizeEditorContent(editor);
  let count = 10;
  while (
    JSON.stringify(beforeNormalize) !== JSON.stringify(afterNormalize) &&
    count > 0
  ) {
    beforeNormalize = afterNormalize;
    afterNormalize = normalizeEditorContent(afterNormalize);
    count -= 1;
  }

  const content: Descendant[] =
    afterNormalize.length > 0
      ? afterNormalize
      : [
          {
            type: "paragraph" as const,
            children: [
              {
                type: "formatted" as const,
                text: "",
              },
            ],
          },
        ];

  positionMap.pruneInvalidPaths((path) => isPathInNodes(content, path));

  return {
    content,
    positionMap,
  };
};

export const importFromMarkdown = (
  markdown: string,
  ignoreTypes: string[] = [],
): Descendant[] => {
  // 重置脚注定义映射
  footnoteDefinitionsMap.clear();
  const parseResult = unified()
    .use(remarkParse)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(remarkHtmlProcessor)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkDirective)
    .use(remarkFrontmatter, ["yaml"])
    .parse(markdown);

  // 首次遍历：收集所有脚注定义
  const collectFootnoteDefinitions = (nodes: typeof parseResult.children) => {
    for (const node of nodes) {
      if (node.type === "footnoteDefinition") {
        // 提取脚注内容
        const content = extractTextFromNode(node);
        footnoteDefinitionsMap.set(node.identifier, content);
      }
    }
  };

  collectFootnoteDefinitions(parseResult.children);

  const editor: Descendant[] = [];

  const dfs = (
    astNodes: any[],
    slateResultArray: Descendant[],
    ignoreTypes: string[] = [],
    parentAstNodeForChildren: any | null = null,
  ) => {
    for (const astChildNode of astNodes) {
      while (
        astChildNode.type === "link" &&
        astChildNode.children &&
        astChildNode.children.some((c: any) => c.type === "html")
      ) {
        const index = astChildNode.children.findIndex(
          (child: any) => child.type === "html",
        );
        const paragraph = astChildNode.children[index];
        paragraph.type = "text";
      }
      if (ignoreTypes.includes(astChildNode.type)) continue;
      const slateNode = markdownToDescendant(
        astChildNode,
        parentAstNodeForChildren,
        astNodes,
      );
      if (!slateNode) continue;
      if (!Array.isArray(slateNode)) {
        slateResultArray.push(slateNode);
        if (astChildNode.children && slateNode.type !== "formatted") {
          dfs(
            astChildNode.children,
            slateNode.children,
            ignoreTypes,
            astChildNode,
          );
        }
      } else {
        slateResultArray.push(...slateNode);
      }
    }
  };

  console.log("parseResult", parseResult);

  // 添加 footnoteDefinition 到忽略类型，因为我们已经手动处理了
  const extendedIgnoreTypes = [...ignoreTypes, "footnoteDefinition"];
  dfs(parseResult.children, editor, extendedIgnoreTypes, parseResult);

  let beforeNormalize = editor;
  let afterNormalize = normalizeEditorContent(editor);
  let count = 10;
  while (
    JSON.stringify(beforeNormalize) !== JSON.stringify(afterNormalize) &&
    count > 0
  ) {
    beforeNormalize = afterNormalize;
    afterNormalize = normalizeEditorContent(afterNormalize);
    count -= 1;
  }
  if (afterNormalize.length === 0) {
    return [
      {
        type: "paragraph",
        children: [
          {
            type: "formatted",
            text: "",
          },
        ],
      },
    ];
  }
  return afterNormalize;
};

const normalizeEditorContent = (
  editor: Descendant[],
  result: Descendant[] = [],
  parent: Descendant | null = null,
): Descendant[] => {
  for (let i = 0; i < editor.length; i++) {
    const element = editor[i];
    if (element.type !== "formatted" && element.children.length === 0) {
      continue;
    } else if (
      element.type === "link" &&
      element.children.some((child) => child.type !== "formatted")
    ) {
      while (element.children.some((child) => child.type !== "formatted")) {
        element.children.splice(
          element.children.findIndex((child) => child.type !== "formatted"),
          1,
        );
      }
    } else if (element.type === "paragraph") {
      // 如果 paragraph 仅包含一个 image，则将该 image 提升为块级元素，避免被转换为 inline-image
      if (
        element.children.length === 1 &&
        // @ts-ignore
        element.children[0].type === "image"
      ) {
        const onlyChild = element.children[0] as ImageElement;
        if (onlyChild && Array.isArray(onlyChild.children)) {
          // 规范化 image 的子节点
          onlyChild.children = [
            {
              type: "formatted",
              text: "",
            },
          ];
        }
        result.push(onlyChild);
        continue;
      }
      // 把 image 都变为 inline-image
      // 把 html-block 变为 html-inline
      element.children = element.children.map((child) => {
        // @ts-ignore
        if (child.type === "image") {
          return {
            type: "inline-image",
            url: (child as ImageElement).url,
            alt: (child as ImageElement).alt,
            uuid: (child as ImageElement).uuid || uuid(),
            children: [
              {
                type: "formatted",
                text: "",
              },
            ],
          };
        }
        // @ts-ignore
        if (child.type === "html-block") {
          return {
            type: "html-inline",
            html: (child as HTMLBlockElement).html,
            children: [
              {
                type: "formatted",
                text: "",
              },
            ],
          };
        }
        return child;
      });
      if (element.children.length === 0) {
        continue;
      }
    } else if (
      parent &&
      element.type === "divide-line" &&
      // @ts-ignore
      parent.children[i + 1]?.type === "divide-line"
    ) {
      continue;
    }
    if (element.type !== "formatted" && element.children) {
      element.children = normalizeEditorContent(element.children, [], element);
    }

    result.push(element);
  }
  return result;
};
