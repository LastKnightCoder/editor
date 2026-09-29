import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkCjkFriendly from "remark-cjk-friendly/parseOnly";
import remarkCjkFriendlyGfmStrikethrough from "remark-cjk-friendly-gfm-strikethrough/parseOnly";
import remarkMath from "remark-math";
import remarkDirective from "remark-directive";
import remarkRehype from "remark-rehype";
import { RETIRED_TYPES } from "@tau/db-schema/src/retired-editor-blocks.ts";
import {
  UNKNOWN_NODE_DIRECTIVE,
  isRestoredNode,
  markRestored,
  parseUnknownNode,
} from "./unknownNode.ts";
import remarkFrontmatter from "remark-frontmatter";
import type { Descendant } from "slate";
import { v4 as uuid } from "uuid";
import { visit } from "unist-util-visit";
import { normalizeCodeBlockLanguageDisplayName } from "@tau/shared/src/utils/code-block-language.ts";
import type { HighlightColor, HTMLBlockElement, ImageElement } from "./types.ts";
import {
  TEXT_GRADIENT_PRESETS,
  type TextGradientPresetId,
} from "@tau/editor/src/constants/text-gradient.ts";
import { PositionMapper } from "./positionMapper.ts";
import type { ElementMapping, MarkdownPosition, TextMapping } from "./positionMapper.ts";

import type { CustomDirectiveHandler } from "./codec.ts";

export interface SlateWithPositions {
  content: Descendant[];
  positionMap: PositionMapper;
}

type MarkdownAstPoint = {
  line?: number;
  column?: number;
  offset?: number;
};

type MarkdownAstPosition = {
  start?: MarkdownAstPoint;
  end?: MarkdownAstPoint;
};

interface MarkdownAstNode {
  type: string;
  value: string;
  url: string;
  alt: string;
  lang: string;
  meta: string;
  depth: 1 | 2 | 3 | 4 | 5 | 6;
  ordered: boolean;
  identifier: string;
  name: string;
  htmlType?: "block" | "inline";
  attributes: Record<string, string | undefined>;
  children: MarkdownAstNode[];
  parent?: MarkdownAstNodeWithChildren;
  position?: MarkdownAstPosition;
  [key: string]: unknown;
}

interface MarkdownAstNodeWithChildren extends MarkdownAstNode {
  children: MarkdownAstNode[];
}

const isMarkdownAstNode = (value: unknown): value is Partial<MarkdownAstNode> => {
  return typeof value === "object" && value !== null;
};

const getDescendantChildren = (node: Descendant): Descendant[] => {
  if (!("children" in node)) return [];
  return Array.isArray(node.children) ? (node.children as Descendant[]) : [];
};

const getFormattedText = (node: Descendant): string => {
  if (!("text" in node)) return "";
  return typeof node.text === "string" ? node.text : "";
};

const remarkHtmlProcessor = () => (tree: unknown) => {
  const visitTree = tree as Parameters<typeof visit>[0];
  const root = tree as MarkdownAstNodeWithChildren;
  // 第一次遍历：合并连续的 HTML 节点
  let htmlBuffer: {
    node: MarkdownAstNode;
    parent: MarkdownAstNodeWithChildren;
  }[] = [];
  visit(visitTree, "html", (node, _, parent) => {
    if (!isMarkdownAstNode(node)) return;
    const currentParent = parent as unknown as MarkdownAstNodeWithChildren;
    if (!Array.isArray(currentParent.children)) return;
    const currentNode = node as MarkdownAstNode;

    if (htmlBuffer.length === 0) {
      htmlBuffer.push({ node: currentNode, parent: currentParent });
    } else {
      const last = htmlBuffer[htmlBuffer.length - 1];
      if (last.parent === currentParent) {
        htmlBuffer.push({ node: currentNode, parent: currentParent });
      } else {
        processBuffer(htmlBuffer);
        htmlBuffer = [{ node: currentNode, parent: currentParent }];
      }
    }
  });

  // 处理剩余的缓冲
  if (htmlBuffer.length > 0) {
    processBuffer(htmlBuffer);
  }

  // 第二次遍历：判断 HTML 类型并调整结构
  visit(visitTree, node => {
    if (!isMarkdownAstNode(node) || node.type !== "html") return;
    if (typeof node.value !== "string") return;

    const isBlockHtml = node.value.match(/^<(div|p|table|ul|ol|h[1-6])/i);
    const parentIsParagraph = node.parent?.type === "paragraph";

    // 添加类型标记
    node.htmlType = isBlockHtml ? "block" : "inline";

    // 处理块级 HTML 的段落包裹问题
    if (node.htmlType === "block" && parentIsParagraph && node.parent) {
      const parentNode = node.parent as MarkdownAstNodeWithChildren;
      const paragraphIndex = parentNode.children.indexOf(node as MarkdownAstNode);
      parentNode.children.splice(paragraphIndex, 1);
      const rootIndex = root.children.indexOf(parentNode);
      root.children.splice(rootIndex + 1, 0, node as MarkdownAstNode);
    }
  });
};

function processBuffer(buffer: { node: MarkdownAstNode; parent: MarkdownAstNodeWithChildren }[]) {
  if (buffer.length < 2) return;

  const nodes = buffer.map(b => b.node);
  const parent = buffer[0].parent;
  const startIndex = parent.children.indexOf(nodes[0]);

  // 合并 HTML 内容
  const mergedValue = nodes.map(n => n.value).join("\n");

  // 创建新节点
  const mergedNode: MarkdownAstNode = {
    type: "html",
    value: mergedValue,
    url: "",
    alt: "",
    lang: "",
    meta: "",
    depth: 1,
    ordered: false,
    identifier: "",
    name: "",
    attributes: {},
    children: [],
    position: {
      start: nodes[0]?.position?.start,
      end: nodes[nodes.length - 1]?.position?.end,
    },
  };

  // 替换原节点
  parent.children.splice(startIndex, nodes.length, mergedNode);
}

const KBD_OPEN_TAG_REGEX = /^<kbd(?:\s+[^>]*)?>$/i;
const KBD_CLOSE_TAG_REGEX = /^<\/kbd>$/i;
const TEXT_GRADIENT_PRESET_SET = new Set<TextGradientPresetId>(
  Object.keys(TEXT_GRADIENT_PRESETS) as TextGradientPresetId[]
);
const MAGIC_MOVE_META_PREFIX = "smm=";

interface MarkdownMagicMoveStep {
  id: string;
  title?: string;
  code: string;
  highlightLines?: string;
}

interface MarkdownMagicMovePayload {
  v: 1;
  activeStep: number;
  steps: MarkdownMagicMoveStep[];
}

const resolveTextGradientPreset = (preset: unknown): TextGradientPresetId | undefined => {
  if (typeof preset !== "string") return undefined;
  return TEXT_GRADIENT_PRESET_SET.has(preset as TextGradientPresetId)
    ? (preset as TextGradientPresetId)
    : undefined;
};

const decodeBase64Url = (value: string): string => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4;
  const withPadding = padding === 0 ? normalized : `${normalized}${"=".repeat(4 - padding)}`;
  const binary = atob(withPadding);
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

const HIGHLIGHT_META_REGEX = /\{([\d,\-\s]+)\}/;

const normalizeHighlightLines = (highlightLines: unknown): string | undefined => {
  if (typeof highlightLines !== "string" || !highlightLines.trim()) return undefined;
  const normalized = highlightLines
    .trim()
    .replace(/\s*,\s*/g, ",")
    .replace(/\s*-\s*/g, "-");
  if (!/^[\d,\-]+$/.test(normalized)) return undefined;
  return normalized;
};

const parseHighlightMeta = (meta: unknown): string | undefined => {
  if (typeof meta !== "string" || !meta.trim()) return undefined;
  const match = meta.match(HIGHLIGHT_META_REGEX);
  if (!match) return undefined;
  return normalizeHighlightLines(match[1]);
};

const parseMagicMoveMeta = (
  meta: unknown,
  fallbackCode: string
): MarkdownMagicMovePayload | undefined => {
  if (typeof meta !== "string" || !meta.trim()) {
    return undefined;
  }

  const token = meta.split(/\s+/).find(item => item.startsWith(MAGIC_MOVE_META_PREFIX));
  if (!token) {
    return undefined;
  }

  try {
    const encoded = token.slice(MAGIC_MOVE_META_PREFIX.length);
    const parsed: unknown = JSON.parse(decodeBase64Url(encoded));
    const parsedRecord =
      typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
    const parsedSteps = parsedRecord?.steps;
    if (
      !parsedRecord ||
      parsedRecord.v !== 1 ||
      !Array.isArray(parsedSteps) ||
      parsedSteps.length < 1
    ) {
      return undefined;
    }

    const steps = parsedSteps.map((step: unknown, index: number) => {
      const stepRecord =
        typeof step === "object" && step !== null ? (step as Record<string, unknown>) : {};
      const stepId = stepRecord.id;
      const stepTitle = stepRecord.title;
      const stepCode = stepRecord.code;
      const stepHighlightLines = stepRecord.highlightLines;

      return {
        id: typeof stepId === "string" && stepId.trim() ? stepId.trim() : `step-${index + 1}`,
        title: typeof stepTitle === "string" ? stepTitle : undefined,
        code: typeof stepCode === "string" ? stepCode : "",
        highlightLines: normalizeHighlightLines(stepHighlightLines),
      };
    });

    if (steps.length < 1) {
      return undefined;
    }

    const activeStep = Math.min(
      Math.max(Number(parsedRecord.activeStep) || 0, 0),
      steps.length - 1
    );
    steps[activeStep].code = fallbackCode;

    return {
      v: 1,
      activeStep,
      steps,
    };
  } catch {
    return undefined;
  }
};

const isKbdOpenTagNode = (node: unknown): boolean => {
  if (!isMarkdownAstNode(node)) return false;
  if (node.type !== "html" || typeof node.value !== "string") {
    return false;
  }
  return KBD_OPEN_TAG_REGEX.test(node.value.trim());
};

const isKbdCloseTagNode = (node: unknown): boolean => {
  if (!isMarkdownAstNode(node)) return false;
  if (node.type !== "html" || typeof node.value !== "string") {
    return false;
  }
  return KBD_CLOSE_TAG_REGEX.test(node.value.trim());
};

const findMatchingKbdCloseIndex = (astNodes: MarkdownAstNode[], startIndex: number) => {
  let depth = 0;
  for (let i = startIndex; i < astNodes.length; i++) {
    const node = astNodes[i];
    if (isKbdOpenTagNode(node)) {
      depth += 1;
      continue;
    }
    if (isKbdCloseTagNode(node)) {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
};

/** 兜底语法（unknownNode.ts）还原：块级取容器里的 json 围栏，行内取 json 属性 */
const restoreUnknownNode = (node: MarkdownAstNode): Descendant | null => {
  const json =
    node.type === "containerDirective"
      ? node.children?.find(child => child.type === "code" && child.lang === "json")?.value
      : node.attributes?.json;
  const restored = parseUnknownNode(json);
  return restored ? markRestored(restored) : null;
};

const markdownToDescendant = (
  node: MarkdownAstNode,
  parentAstNode: unknown = null,
  astChildrenOfParent: unknown[] = []
): Descendant | Descendant[] | null => {
  if (node.type.endsWith("Directive") && RETIRED_TYPES.has(node.name)) return null;
  if (node.type.endsWith("Directive") && node.name === UNKNOWN_NODE_DIRECTIVE) {
    const restored = restoreUnknownNode(node);
    if (restored) return restored;
  }
  const parentNode = isMarkdownAstNode(parentAstNode) ? (parentAstNode as MarkdownAstNode) : null;
  const siblingNodes = astChildrenOfParent as MarkdownAstNode[];

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
    const listItemElement: {
      type: "list-item";
      children: Descendant[];
      icon?: string;
      iconType?: "emoji" | "image";
      iconUrl?: string;
    } = {
      type: "list-item",
      children: [],
    };

    if (node.children && node.children.length > 0) {
      const firstChild = node.children[0];
      if (
        firstChild.type === "paragraph" &&
        firstChild.children &&
        firstChild.children.length > 0
      ) {
        const firstNode = firstChild.children[0];

        if (firstNode.type === "image") {
          const url = firstNode.url || "";

          // Match emoji protocol: emoji: or emoji://
          if (url.startsWith("emoji:") || url.startsWith("emoji://")) {
            const emoji = url.replace(/^emoji:\/?\/?/, "");
            listItemElement.icon = emoji;
            listItemElement.iconType = "emoji";

            firstChild.children.shift();
          } else if (url.startsWith("list-icon:") || url.startsWith("list-icon://")) {
            const imageUrl = url.replace(/^list-icon:\/?\/?/, "");
            listItemElement.iconUrl = imageUrl;
            listItemElement.iconType = "image";

            firstChild.children.shift();
          }
        }
      }
    }

    return listItemElement as unknown as Descendant;
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
    const magicMove = parseMagicMoveMeta(node.meta, node.value);
    let highlightLines = parseHighlightMeta(node.meta);
    if (magicMove) {
      const safeStep = Math.min(
        Math.max(Number(magicMove.activeStep) || 0, 0),
        magicMove.steps.length - 1
      );
      const activeStep = magicMove.steps[safeStep];
      if (activeStep) {
        if (!activeStep.highlightLines && highlightLines) {
          activeStep.highlightLines = highlightLines;
        }
        highlightLines = activeStep.highlightLines ?? highlightLines;
      }
    }
    return {
      type: "code-block",
      language: normalizeCodeBlockLanguageDisplayName(node.lang),
      code: node.value,
      uuid: uuid(),
      ...(magicMove ? { magicMove } : {}),
      ...(highlightLines ? { highlightLines } : {}),
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
    const customContainerHandler = getCurrentParseContext().customDirectiveHandlers.get(node.name);
    if (customContainerHandler) {
      return customContainerHandler(node.attributes || {});
    }
    return null;
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
      parentNode &&
      parentNode.type === "paragraph" &&
      siblingNodes &&
      siblingNodes.length === 1 &&
      siblingNodes[0] === node;

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
    const customLeafHandler = getCurrentParseContext().customDirectiveHandlers.get(node.name);
    if (customLeafHandler) {
      return customLeafHandler(node.attributes || {});
    }
    return {
      type: "formatted",
      text: `::${node.name}`,
    };
  } else if (node.type === "textDirective") {
    const attributes = node.attributes || {};
    const customTextHandler = getCurrentParseContext().customDirectiveHandlers.get(node.name);
    if (customTextHandler) {
      return customTextHandler(attributes);
    }
    const color = attributes.color || "";
    const darkColor = attributes.darkColor || "";
    const textGradient = resolveTextGradientPreset(attributes.preset);
    if (node.name === "color") {
      const colorAttributes = { color, darkColor };
      return node.children
        .map(markdownToDescendant)
        .filter(Boolean)
        .map((item: Descendant | Descendant[] | null) => {
          if (!item) return undefined;
          if (Array.isArray(item)) {
            return item
              .map(i => {
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
    } else if (node.name === "gradient") {
      const gradientAttributes = textGradient ? { textGradient } : {};
      return node.children
        .map(markdownToDescendant)
        .filter(Boolean)
        .map((item: Descendant | Descendant[] | null) => {
          if (!item) return undefined;
          if (Array.isArray(item)) {
            return item
              .map(i => {
                if (i.type !== "formatted") return undefined;
                return { ...i, ...gradientAttributes };
              })
              .filter(Boolean) as Descendant[];
          }
          if (item.type !== "formatted") return item;
          return { ...item, ...gradientAttributes };
        })
        .filter(Boolean)
        .flat() as Descendant[];
    } else if (node.name === "highlight") {
      const highlightColor = attributes.color || "yellow";
      return node.children
        .map(markdownToDescendant)
        .filter(Boolean)
        .map((item: Descendant | Descendant[] | null) => {
          if (!item) return undefined;
          if (Array.isArray(item)) {
            return item
              .map(i => {
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
      .map((item: Descendant | Descendant[] | null) => {
        if (!item) return undefined;
        if (Array.isArray(item)) {
          return item
            .map(i => {
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
    const content = getCurrentParseContext().footnoteDefinitions.get(node.identifier) || "";
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
      parentNode &&
      (parentNode.type === "paragraph" ||
        parentNode.type === "link" ||
        parentNode.type === "heading")
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

export interface ImportFromMarkdownOptions {
  /** 宿主注册的业务 directive（container / leaf / text 三种都查），优先于内置分支 */
  customDirectives?: Record<string, CustomDirectiveHandler>;
}

/** 单次导入的解析上下文：随导入调用入栈 / 出栈，嵌套导入（handler 内再次导入）互不干扰 */
interface MarkdownParseContext {
  footnoteDefinitions: Map<string, string>;
  customDirectiveHandlers: Map<string, CustomDirectiveHandler>;
  /** 位置映射只记元素级范围的类型 */
  voidTypes: ReadonlySet<string>;
  /** 子文本按整体范围记前后缀的 text directive 名 */
  inlineWrapperDirectives: ReadonlySet<string>;
}

/** 处理器级配置：宿主 codec 合并后的结果（框架不自带任何元素类型） */
export interface ImportConfig {
  directives: Record<string, CustomDirectiveHandler>;
  voidTypes: ReadonlySet<string>;
  inlineWrapperDirectives: ReadonlySet<string>;
}

const parseContextStack: MarkdownParseContext[] = [];

const getCurrentParseContext = (): MarkdownParseContext => {
  const context = parseContextStack[parseContextStack.length - 1];
  if (!context) {
    throw new Error("[markdown] 解析上下文缺失：解析逻辑必须在导入函数调用内执行");
  }
  return context;
};

const withParseContext = <T>(
  config: ImportConfig,
  options: ImportFromMarkdownOptions | undefined,
  run: () => T
): T => {
  parseContextStack.push({
    footnoteDefinitions: new Map(),
    // 调用时传入的 customDirectives 覆盖处理器级 codec
    customDirectiveHandlers: new Map(
      Object.entries({ ...config.directives, ...options?.customDirectives })
    ),
    voidTypes: config.voidTypes,
    inlineWrapperDirectives: config.inlineWrapperDirectives,
  });
  try {
    return run();
  } finally {
    parseContextStack.pop();
  }
};

// 提取节点中的文本内容
const extractTextFromNode = (node: unknown): string => {
  const currentNode = node as Partial<MarkdownAstNode>;
  if (currentNode.type === "text") {
    return typeof currentNode.value === "string" ? currentNode.value : "";
  }
  if (Array.isArray(currentNode.children)) {
    return currentNode.children.map(extractTextFromNode).join("");
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
  textGradient?: TextGradientPresetId;
  highlight?: boolean | HighlightColor;
};

const applyMarks = (node: Descendant, marks: MarkContext): Descendant => {
  if (node.type !== "formatted") return node;
  return {
    ...node,
    ...marks,
  };
};

const toMarkdownPosition = (point?: { line?: number; column?: number }): MarkdownPosition => {
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
  fallback = 0
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
  let current: { children?: Descendant[] } = { children: nodes };
  for (const index of path) {
    if (!current.children || index < 0 || index >= current.children.length) {
      return false;
    }
    current = current.children[index] as { children?: Descendant[] };
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
    prefixLength = Math.max(0, (textPosition.start.column ?? 1) - (wrapper.start.column ?? 1));
  }

  if (typeof params.suffixLengthOverride === "number") {
    suffixLength = params.suffixLengthOverride;
  } else if (textEndOffset !== null && wrapperEndOffset !== null) {
    suffixLength = Math.max(0, wrapperEndOffset - textEndOffset);
  } else if (wrapper.end.line === textPosition.end.line) {
    suffixLength = Math.max(0, (wrapper.end.column ?? 1) - (textPosition.end.column ?? 1));
  }

  const mdLength = getRangeLength(
    wrapper.start,
    wrapper.end,
    prefixLength + text.length + suffixLength
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

const isVoidSlateElementType = (type: string): boolean =>
  getCurrentParseContext().voidTypes.has(type);

/**
 * Markdown 导入（带位置映射）
 */
export const importFromMarkdownWithPositionsUsing = (
  config: ImportConfig,
  markdown: string,
  ignoreTypes: string[] = [],
  options?: ImportFromMarkdownOptions
): SlateWithPositions =>
  withParseContext(config, options, () => importWithPositionsInContext(markdown, ignoreTypes));

const importWithPositionsInContext = (
  markdown: string,
  ignoreTypes: string[]
): SlateWithPositions => {
  const footnoteDefinitions = getCurrentParseContext().footnoteDefinitions;

  const positionMap = new PositionMapper();

  const parseResult = unified()
    .use(remarkParse)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(remarkHtmlProcessor)
    .use(remarkGfm)
    .use(remarkCjkFriendly)
    .use(remarkCjkFriendlyGfmStrikethrough)
    .use(remarkMath)
    .use(remarkDirective)
    .use(remarkFrontmatter, ["yaml"])
    .parse(markdown);

  // 首次遍历：收集所有脚注定义
  const collectFootnoteDefinitions = (nodes: typeof parseResult.children) => {
    for (const node of nodes) {
      if (node.type === "footnoteDefinition") {
        const content = extractTextFromNode(node);
        footnoteDefinitions.set(node.identifier, content);
      }
    }
  };

  collectFootnoteDefinitions(parseResult.children);

  const editor: Descendant[] = [];

  const dfsWithPositions = (
    astNodes: MarkdownAstNode[],
    slateResultArray: Descendant[],
    ignoreTypes: string[] = [],
    parentAstNodeForChildren: MarkdownAstNode | null = null,
    parentPath: number[] = [],
    markContext: MarkContext = {},
    wrapperPosition?: {
      start?: { line?: number; column?: number; offset?: number };
      end?: { line?: number; column?: number; offset?: number };
    }
  ) => {
    let astNodeIndex = 0;
    let skipUntilIndex = -1;

    for (const astChildNode of astNodes) {
      if (astNodeIndex <= skipUntilIndex) {
        astNodeIndex += 1;
        continue;
      }

      while (
        astChildNode.type === "link" &&
        astChildNode.children &&
        astChildNode.children.some((c: MarkdownAstNode) => c.type === "html")
      ) {
        const index = astChildNode.children.findIndex(
          (child: MarkdownAstNode) => child.type === "html"
        );
        const paragraph = astChildNode.children[index];
        paragraph.type = "text";
      }

      if (ignoreTypes.includes(astChildNode.type)) {
        astNodeIndex += 1;
        continue;
      }

      if (isKbdOpenTagNode(astChildNode)) {
        const closeIndex = findMatchingKbdCloseIndex(astNodes, astNodeIndex);
        if (closeIndex > astNodeIndex) {
          const closeNode = astNodes[closeIndex];
          const innerAstNodes = astNodes.slice(astNodeIndex + 1, closeIndex);
          const slateNode: Descendant = {
            type: "kbd",
            children: [],
          } as Descendant;

          const insertIndex = slateResultArray.length;
          slateResultArray.push(slateNode);
          const slatePath = [...parentPath, insertIndex];

          dfsWithPositions(
            innerAstNodes,
            getDescendantChildren(slateNode),
            ignoreTypes,
            astChildNode,
            slatePath,
            markContext,
            {
              start: astChildNode.position?.start,
              end: closeNode?.position?.end || astChildNode.position?.end,
            }
          );

          skipUntilIndex = closeIndex;
          astNodeIndex += 1;
          continue;
        }
      }

      if (astChildNode.type === "strong") {
        dfsWithPositions(
          astChildNode.children || [],
          slateResultArray,
          ignoreTypes,
          astChildNode,
          parentPath,
          { ...markContext, bold: true },
          astChildNode.position
        );
        astNodeIndex += 1;
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
          astChildNode.position
        );
        astNodeIndex += 1;
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
          astChildNode.position
        );
        astNodeIndex += 1;
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
            wrapperPosition
          );
          astNodeIndex += 1;
          continue;
        }

        if (astChildNode.name === "gradient") {
          const attributes = astChildNode.attributes || {};
          const textGradient = resolveTextGradientPreset(attributes.preset);
          dfsWithPositions(
            astChildNode.children || [],
            slateResultArray,
            ignoreTypes,
            astChildNode,
            parentPath,
            textGradient ? { ...markContext, textGradient } : { ...markContext },
            wrapperPosition
          );
          astNodeIndex += 1;
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
              highlight: (attributes.color || "yellow") as HighlightColor,
            },
            wrapperPosition
          );
          astNodeIndex += 1;
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
        astNodeIndex += 1;
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
          astChildNode.value?.length ?? 0
        );
        const extra = Math.max(0, totalLength - (astChildNode.value?.length ?? 0));
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
        astNodeIndex += 1;
        continue;
      }

      const slateNode = markdownToDescendant(astChildNode, parentAstNodeForChildren, astNodes);

      if (!slateNode) {
        astNodeIndex += 1;
        continue;
      }

      const nodesToInsert = Array.isArray(slateNode)
        ? slateNode.map(node => applyMarks(node, markContext))
        : [applyMarks(slateNode, markContext)];

      for (const node of nodesToInsert) {
        const insertIndex = slateResultArray.length;
        slateResultArray.push(node);
        const slatePath = [...parentPath, insertIndex];

        if (node.type === "formatted") {
          const mapping = buildTextMapping({
            slateTextPath: slatePath,
            text: getFormattedText(node),
            textPosition: astChildNode.position,
            wrapperPosition,
          });
          if (mapping) {
            positionMap.addTextMapping(mapping);
          }
        } else if (
          astChildNode.position &&
          (isVoidSlateElementType(node.type) || isRestoredNode(node))
        ) {
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
            const codeStartCh = mdStart.ch;
            const codeEndCh =
              lines.length > 0 ? codeStartCh + lines[lines.length - 1].length : codeStartCh;
            elementMapping.propertyMappings = {
              code: {
                mdStartLine: codeStartLine,
                mdStartCh: codeStartCh,
                mdEndLine: codeEndLine,
                mdEndCh: codeEndCh,
              },
            };
          }

          positionMap.addElementMapping(elementMapping);
        }

        if (astChildNode.children && node.type !== "formatted" && !isRestoredNode(node)) {
          const nextWrapper =
            astChildNode.type === "link" ||
            (astChildNode.type === "textDirective" &&
              getCurrentParseContext().inlineWrapperDirectives.has(astChildNode.name))
              ? astChildNode.position
              : wrapperPosition;

          dfsWithPositions(
            astChildNode.children,
            getDescendantChildren(node),
            ignoreTypes,
            astChildNode,
            slatePath,
            markContext,
            nextWrapper
          );
        }
      }

      astNodeIndex += 1;
    }
  };

  const extendedIgnoreTypes = [...ignoreTypes, "footnoteDefinition"];
  dfsWithPositions(
    parseResult.children as unknown as MarkdownAstNode[],
    editor,
    extendedIgnoreTypes,
    parseResult as unknown as MarkdownAstNode,
    []
  );

  let beforeNormalize = editor;
  let afterNormalize = normalizeEditorContent(editor);
  let count = 10;
  while (JSON.stringify(beforeNormalize) !== JSON.stringify(afterNormalize) && count > 0) {
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

  positionMap.pruneInvalidPaths(path => isPathInNodes(content, path));

  return {
    content,
    positionMap,
  };
};

export const importFromMarkdownUsing = (
  config: ImportConfig,
  markdown: string,
  ignoreTypes: string[] = [],
  options?: ImportFromMarkdownOptions
): Descendant[] => withParseContext(config, options, () => importInContext(markdown, ignoreTypes));

const importInContext = (markdown: string, ignoreTypes: string[]): Descendant[] => {
  const footnoteDefinitions = getCurrentParseContext().footnoteDefinitions;
  // 历史版本曾为绕过 CJK 加粗解析问题在 markdown 中驻留零宽空格，导入时剥离净化；
  // importFromMarkdownWithPositions 因位置映射绑定原始串，不做剥离
  const sanitized = markdown.replace(/\u200B/g, "");
  const parseResult = unified()
    .use(remarkParse)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(remarkHtmlProcessor)
    .use(remarkGfm)
    .use(remarkCjkFriendly)
    .use(remarkCjkFriendlyGfmStrikethrough)
    .use(remarkMath)
    .use(remarkDirective)
    .use(remarkFrontmatter, ["yaml"])
    .parse(sanitized);

  // 首次遍历：收集所有脚注定义
  const collectFootnoteDefinitions = (nodes: typeof parseResult.children) => {
    for (const node of nodes) {
      if (node.type === "footnoteDefinition") {
        // 提取脚注内容
        const content = extractTextFromNode(node);
        footnoteDefinitions.set(node.identifier, content);
      }
    }
  };

  collectFootnoteDefinitions(parseResult.children);

  const editor: Descendant[] = [];

  const dfs = (
    astNodes: MarkdownAstNode[],
    slateResultArray: Descendant[],
    ignoreTypes: string[] = [],
    parentAstNodeForChildren: MarkdownAstNode | null = null
  ) => {
    let astNodeIndex = 0;
    let skipUntilIndex = -1;

    for (const astChildNode of astNodes) {
      if (astNodeIndex <= skipUntilIndex) {
        astNodeIndex += 1;
        continue;
      }

      while (
        astChildNode.type === "link" &&
        astChildNode.children &&
        astChildNode.children.some((c: MarkdownAstNode) => c.type === "html")
      ) {
        const index = astChildNode.children.findIndex(
          (child: MarkdownAstNode) => child.type === "html"
        );
        const paragraph = astChildNode.children[index];
        paragraph.type = "text";
      }
      if (ignoreTypes.includes(astChildNode.type)) {
        astNodeIndex += 1;
        continue;
      }

      if (isKbdOpenTagNode(astChildNode)) {
        const closeIndex = findMatchingKbdCloseIndex(astNodes, astNodeIndex);
        if (closeIndex > astNodeIndex) {
          const innerAstNodes = astNodes.slice(astNodeIndex + 1, closeIndex);
          const kbdNode: Descendant = {
            type: "kbd",
            children: [],
          } as Descendant;
          slateResultArray.push(kbdNode);
          dfs(innerAstNodes, getDescendantChildren(kbdNode), ignoreTypes, astChildNode);
          skipUntilIndex = closeIndex;
          astNodeIndex += 1;
          continue;
        }
      }

      const slateNode = markdownToDescendant(astChildNode, parentAstNodeForChildren, astNodes);
      if (!slateNode) {
        astNodeIndex += 1;
        continue;
      }
      if (!Array.isArray(slateNode)) {
        slateResultArray.push(slateNode);
        if (astChildNode.children && slateNode.type !== "formatted" && !isRestoredNode(slateNode)) {
          dfs(astChildNode.children, slateNode.children, ignoreTypes, astChildNode);
        }
      } else {
        slateResultArray.push(...slateNode);
      }

      astNodeIndex += 1;
    }
  };

  // 添加 footnoteDefinition 到忽略类型，因为我们已经手动处理了
  const extendedIgnoreTypes = [...ignoreTypes, "footnoteDefinition"];
  dfs(
    parseResult.children as unknown as MarkdownAstNode[],
    editor,
    extendedIgnoreTypes,
    parseResult as unknown as MarkdownAstNode
  );

  let beforeNormalize = editor;
  let afterNormalize = normalizeEditorContent(editor);
  let count = 10;
  while (JSON.stringify(beforeNormalize) !== JSON.stringify(afterNormalize) && count > 0) {
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
  parent: Descendant | null = null
): Descendant[] => {
  for (let i = 0; i < editor.length; i++) {
    const element = editor[i];
    // 兜底还原的节点保持原样（ER-006）
    if (isRestoredNode(element)) {
      result.push(element);
      continue;
    }
    if (element.type !== "formatted" && element.children.length === 0) {
      continue;
    } else if (
      element.type === "link" &&
      element.children.some(child => child.type !== "formatted")
    ) {
      while (element.children.some(child => child.type !== "formatted")) {
        element.children.splice(
          element.children.findIndex(child => child.type !== "formatted"),
          1
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
      element.children = element.children.map(child => {
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

/** 粗判一段纯文本是否像 Markdown（粘贴时决定要不要按 Markdown 导入） */
export const isMarkdownLikeText = (text: string): boolean => {
  if (!text.trim()) return false;

  const markdownPatterns = [
    /^\s{0,3}#{1,6}\s+/m,
    /^\s*[-*+]\s+/m,
    /^\s*\d+\.\s+/m,
    /^\s*>\s+/m,
    /(^|\n)\s*(```|~~~)/,
    /!\[[^\]]*\]\([^)]+\)/,
    /\[[^\]]+\]\([^)]+\)/,
    /(^|\n)\s*:::[^\n]*/m,
    /(^|\n)\s*::[a-zA-Z-]+(?:\{|\s|$)/m,
    /(^|\n)\s*:[a-zA-Z-]+\[/m,
  ];

  if (markdownPatterns.some(pattern => pattern.test(text))) {
    return true;
  }

  const hasTableRow = /^\s*\|.*\|\s*$/m.test(text);
  const hasTableDivider = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/m.test(text);

  return hasTableRow && hasTableDivider;
};
