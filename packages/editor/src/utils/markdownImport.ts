import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkCjkFriendly from "remark-cjk-friendly/parseOnly";
import remarkCjkFriendlyGfmStrikethrough from "remark-cjk-friendly-gfm-strikethrough/parseOnly";
import remarkMath from "remark-math";
import remarkDirective from "remark-directive";
import remarkRehype from "remark-rehype";
import remarkFrontmatter from "remark-frontmatter";
import { Descendant } from "slate";
import { v4 as uuid } from "uuid";
import { visit } from "unist-util-visit";
import type { AudioElement, ImageElement, StyledTextElement, VideoElement } from "../types";
import { TEXT_GRADIENT_PRESETS, type TextGradientPresetId } from "../constants";

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

const remarkHtmlProcessor = () => (tree: unknown) => {
  const visitTree = tree as Parameters<typeof visit>[0];
  const root = tree as MarkdownAstNodeWithChildren;
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
      return;
    }

    const last = htmlBuffer[htmlBuffer.length - 1];
    if (last.parent === currentParent) {
      htmlBuffer.push({ node: currentNode, parent: currentParent });
      return;
    }

    processBuffer(htmlBuffer);
    htmlBuffer = [{ node: currentNode, parent: currentParent }];
  });

  if (htmlBuffer.length > 0) {
    processBuffer(htmlBuffer);
  }

  visit(visitTree, node => {
    if (!isMarkdownAstNode(node) || node.type !== "html") return;
    if (typeof node.value !== "string") return;

    const isBlockHtml = node.value.match(/^<(div|p|table|ul|ol|h[1-6])/i);
    const parentIsParagraph = node.parent?.type === "paragraph";
    node.htmlType = isBlockHtml ? "block" : "inline";

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

  const nodes = buffer.map(item => item.node);
  const parent = buffer[0].parent;
  const startIndex = parent.children.indexOf(nodes[0]);
  const mergedValue = nodes.map(node => node.value).join("\n");

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

  parent.children.splice(startIndex, nodes.length, mergedNode);
}

const KBD_OPEN_TAG_REGEX = /^<kbd(?:\s+[^>]*)?>$/i;
const KBD_CLOSE_TAG_REGEX = /^<\/kbd>$/i;
const STYLED_TEXT_COLOR_VALUES = ["red", "green", "yellow", "blue", "purple", "gray"] as const;
type StyledTextColorLiteral = (typeof STYLED_TEXT_COLOR_VALUES)[number];
type StyledTextColor = StyledTextElement["color"];
const TEXT_GRADIENT_PRESET_SET = new Set<TextGradientPresetId>(
  Object.keys(TEXT_GRADIENT_PRESETS) as TextGradientPresetId[]
);
const STYLED_TEXT_COLOR_SET = new Set<StyledTextColorLiteral>(STYLED_TEXT_COLOR_VALUES);
const MAGIC_MOVE_META_PREFIX = "smm=";
const HIGHLIGHT_META_REGEX = /\{([\d,\-\s]+)\}/;

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

const resolveStyledTextColor = (color: unknown): StyledTextColor => {
  if (typeof color !== "string") return "red" as StyledTextColor;
  return STYLED_TEXT_COLOR_SET.has(color as StyledTextColorLiteral)
    ? (color as StyledTextColor)
    : ("red" as StyledTextColor);
};

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

  if (typeof atob === "function") {
    const binary = atob(withPadding);
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  return Buffer.from(withPadding, "base64").toString("utf-8");
};

const normalizeHighlightLines = (highlightLines: unknown): string | undefined => {
  if (typeof highlightLines !== "string" || !highlightLines.trim()) {
    return undefined;
  }
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
      return {
        id:
          typeof stepRecord.id === "string" && stepRecord.id.trim()
            ? stepRecord.id.trim()
            : `step-${index + 1}`,
        title: typeof stepRecord.title === "string" ? stepRecord.title : undefined,
        code: typeof stepRecord.code === "string" ? stepRecord.code : "",
        highlightLines: normalizeHighlightLines(stepRecord.highlightLines),
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

/** 单次导入的解析上下文：随 importFromMarkdown 调用入栈/出栈，
 * 嵌套导入（directive handler 内再次调用）互不干扰 */
interface MarkdownParseContext {
  footnoteDefinitions: Map<string, string>;
  /** 宿主注册的业务 directive 解析器（按 directive 名匹配） */
  customDirectiveHandlers: Map<
    string,
    (attributes: Record<string, string | undefined>) => Descendant | null
  >;
}

const parseContextStack: MarkdownParseContext[] = [];

const getCurrentParseContext = (): MarkdownParseContext => {
  const context = parseContextStack[parseContextStack.length - 1];
  if (!context) {
    throw new Error(
      "[editor] markdown 解析上下文缺失：解析逻辑必须在 importFromMarkdown 调用内执行"
    );
  }
  return context;
};

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

const markdownToDescendant = (
  node: MarkdownAstNode,
  parentAstNode: unknown = null,
  astChildrenOfParent: unknown[] = []
): Descendant | Descendant[] | null => {
  const parentNode = isMarkdownAstNode(parentAstNode) ? (parentAstNode as MarkdownAstNode) : null;
  const siblingNodes = astChildrenOfParent as MarkdownAstNode[];

  if (node.type === "heading") {
    return {
      type: "header",
      level: node.depth,
      children: [],
    } as Descendant;
  }

  if (node.type === "paragraph") {
    return {
      type: "paragraph",
      children: [],
    } as Descendant;
  }

  if (node.type === "html") {
    if (node.htmlType === "inline") {
      return {
        type: "html-inline",
        html: node.value,
        openEdit: false,
        children: [{ type: "formatted", text: "" }],
      } as Descendant;
    }

    return {
      type: "html-block",
      html: node.value,
      children: [{ type: "formatted", text: "" }],
    } as Descendant;
  }

  if (node.type === "list") {
    return {
      type: node.ordered ? "numbered-list" : "bulleted-list",
      children: [],
    } as Descendant;
  }

  if (node.type === "listItem") {
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
          if (url.startsWith("emoji:") || url.startsWith("emoji://")) {
            listItemElement.icon = url.replace(/^emoji:\/?\/?/, "");
            listItemElement.iconType = "emoji";
            firstChild.children.shift();
          } else if (url.startsWith("list-icon:") || url.startsWith("list-icon://")) {
            listItemElement.iconUrl = url.replace(/^list-icon:\/?\/?/, "");
            listItemElement.iconType = "image";
            firstChild.children.shift();
          }
        }
      }
    }

    return listItemElement as unknown as Descendant;
  }

  if (node.type === "code") {
    const normalizedLang = node.lang?.trim?.()?.toLowerCase?.() || "";
    if (normalizedLang === "custom-block") {
      return {
        type: "custom-block",
        content: node.value,
        children: [{ type: "formatted", text: "" }],
      } as Descendant;
    }
    if (normalizedLang === "mermaid") {
      return {
        type: "mermaid",
        chart: node.value,
        children: [{ type: "formatted", text: "" }],
      } as Descendant;
    }
    if (normalizedLang === "abc") {
      return {
        type: "abc",
        content: node.value,
        children: [{ type: "formatted", text: "" }],
      } as Descendant;
    }
    if (normalizedLang === "plantuml") {
      return {
        type: "plantuml",
        content: node.value,
        children: [{ type: "formatted", text: "" }],
      } as Descendant;
    }
    if (normalizedLang === "tikz") {
      return {
        type: "tikz",
        content: node.value,
        children: [{ type: "formatted", text: "" }],
      } as Descendant;
    }
    if (normalizedLang === "typst") {
      return {
        type: "typst",
        content: node.value,
        children: [{ type: "formatted", text: "" }],
      } as Descendant;
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
      language: node.lang?.trim?.()?.toUpperCase?.() || "",
      code: node.value,
      uuid: uuid(),
      ...(magicMove ? { magicMove } : {}),
      ...(highlightLines ? { highlightLines } : {}),
      children: [{ type: "formatted", text: "" }],
    } as Descendant;
  }

  if (node.type === "blockquote") {
    return {
      type: "blockquote",
      children: [],
    } as Descendant;
  }

  if (node.type === "math") {
    return {
      type: "block-math",
      tex: node.value,
      children: [{ type: "formatted", text: "" }],
    } as Descendant;
  }

  if (node.type === "table") {
    return {
      type: "table",
      children: [],
    } as Descendant;
  }

  if (node.type === "tableRow") {
    return {
      type: "table-row",
      children: [],
    } as Descendant;
  }

  if (node.type === "tableCell") {
    return {
      type: "table-cell",
      children: [],
    } as Descendant;
  }

  if (node.type === "containerDirective") {
    const customContainerHandler = getCurrentParseContext().customDirectiveHandlers.get(node.name);
    if (customContainerHandler) {
      return customContainerHandler(node.attributes || {});
    }
    if (["note", "tip", "warning", "info", "danger"].includes(node.name)) {
      return {
        type: "callout",
        title: node.attributes.title || "",
        calloutType: node.name,
        children: [],
      } as Descendant;
    }
    if (node.name === "highlight-block") {
      return {
        type: "highlight-block",
        color: (node.attributes.color || "red") as "red" | "green" | "yellow" | "blue" | "purple",
        children: [],
      } as Descendant;
    }
    if (node.name === "detail") {
      return {
        type: "detail",
        title: node.attributes.title || "DETAIL",
        open: node.attributes.open === "true",
        children: [],
      } as Descendant;
    }
    if (node.name === "underline") {
      return {
        type: "underline",
        color: node.attributes.color || "default",
        lineType: node.attributes.lineType || "solid",
        colorSelectOpen: false,
        children: [],
      } as Descendant;
    }
    if (node.name === "video") {
      const element: VideoElement = {
        type: "video",
        src: node.attributes.src || "",
        uploading: false,
        children: [{ type: "formatted", text: "" }],
      };
      if (node.attributes.playbackRate) {
        element.playbackRate = parseFloat(node.attributes.playbackRate);
      }
      if (node.attributes.metaInfo) {
        try {
          const decoded =
            typeof atob === "function"
              ? atob(node.attributes.metaInfo)
              : Buffer.from(node.attributes.metaInfo, "base64").toString("utf-8");
          element.metaInfo = JSON.parse(decoded);
        } catch {
          // 忽略非法 metaInfo
        }
      }
      if (node.attributes.width) {
        element.width = parseInt(node.attributes.width, 10);
      }
      if (node.attributes.align) {
        element.align = node.attributes.align as "left" | "center" | "right";
      }
      return element as Descendant;
    }
    if (node.name === "audio") {
      const element: AudioElement = {
        type: "audio",
        src: node.attributes.src || "",
        uploading: false,
        children: [{ type: "formatted", text: "" }],
      };
      if (node.attributes.isFromGenerate) {
        element.isFromGenerate = node.attributes.isFromGenerate === "true";
      }
      if (node.attributes.audioText) {
        element.audioText = node.attributes.audioText;
      }
      if (node.attributes.title) {
        element.title = node.attributes.title;
      }
      return element as Descendant;
    }
    if (node.name === "chart") {
      try {
        const data = JSON.parse(
          typeof atob === "function"
            ? atob(node.attributes.data || "W10=")
            : Buffer.from(node.attributes.data || "W10=", "base64").toString("utf-8")
        );
        const config = JSON.parse(
          typeof atob === "function"
            ? atob(node.attributes.config || "e30=")
            : Buffer.from(node.attributes.config || "e30=", "base64").toString("utf-8")
        );
        return {
          type: "chart",
          data,
          config,
          children: [{ type: "formatted", text: "" }],
        } as Descendant;
      } catch {
        return null;
      }
    }
    return null;
  }

  if (node.type === "inlineMath") {
    return {
      type: "inline-math",
      tex: node.value,
      children: [{ type: "formatted", text: "" }],
    } as Descendant;
  }

  if (node.type === "image") {
    const isOnlyChildInParagraph =
      parentNode &&
      parentNode.type === "paragraph" &&
      siblingNodes.length === 1 &&
      siblingNodes[0] === node;

    if (isOnlyChildInParagraph) {
      return {
        type: "image",
        url: node.url,
        alt: node.alt,
        children: [{ type: "formatted", text: "" }],
      } as Descendant;
    }

    return {
      type: "inline-image",
      url: node.url,
      alt: node.alt,
      uuid: uuid(),
      children: [{ type: "formatted", text: "" }],
    } as Descendant;
  }

  if (node.type === "link") {
    return {
      type: "link",
      url: node.url,
      children: [],
    } as Descendant;
  }

  if (node.type === "text") {
    return {
      type: "formatted",
      text: node.value,
    } as Descendant;
  }

  if (node.type === "leafDirective") {
    const attributes = node.attributes || {};
    const customLeafHandler = getCurrentParseContext().customDirectiveHandlers.get(node.name);
    if (customLeafHandler) {
      return customLeafHandler(attributes);
    }
    return {
      type: "formatted",
      text: `::${node.name}`,
    } as Descendant;
  }

  if (node.type === "textDirective") {
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
        .map(item => {
          if (!item) return undefined;
          if (Array.isArray(item)) {
            return item
              .map(child => {
                if (child.type !== "formatted") return undefined;
                return { ...child, ...colorAttributes };
              })
              .filter(Boolean) as Descendant[];
          }
          if (item.type !== "formatted") return item;
          return { ...item, ...colorAttributes };
        })
        .filter(Boolean)
        .flat() as Descendant[];
    }

    if (node.name === "gradient") {
      const gradientAttributes = textGradient ? { textGradient } : {};
      return node.children
        .map(markdownToDescendant)
        .filter(Boolean)
        .map(item => {
          if (!item) return undefined;
          if (Array.isArray(item)) {
            return item
              .map(child => {
                if (child.type !== "formatted") return undefined;
                return { ...child, ...gradientAttributes };
              })
              .filter(Boolean) as Descendant[];
          }
          if (item.type !== "formatted") return item;
          return { ...item, ...gradientAttributes };
        })
        .filter(Boolean)
        .flat() as Descendant[];
    }

    if (node.name === "highlight") {
      const highlightColor = attributes.color || "yellow";
      return node.children
        .map(markdownToDescendant)
        .filter(Boolean)
        .map(item => {
          if (!item) return undefined;
          if (Array.isArray(item)) {
            return item
              .map(child => {
                if (child.type !== "formatted") return undefined;
                return { ...child, highlight: highlightColor };
              })
              .filter(Boolean) as Descendant[];
          }
          if (item.type !== "formatted") return item;
          return { ...item, highlight: highlightColor };
        })
        .filter(Boolean)
        .flat() as Descendant[];
    }

    if (node.name === "underline") {
      return {
        type: "underline",
        color: attributes.color || "default",
        lineType: attributes.lineType || "solid",
        colorSelectOpen: false,
        children: [],
      } as Descendant;
    }

    if (node.name === "styled-text") {
      return {
        type: "styled-text",
        color: resolveStyledTextColor(attributes.color),
        children: [],
      } as Descendant;
    }

    if (node.name === "kbd") {
      return {
        type: "kbd",
        children: [],
      } as Descendant;
    }

    return {
      type: "formatted",
      text: `:${node.name}`,
    } as Descendant;
  }

  if (node.type === "inlineCode") {
    return {
      type: "formatted",
      text: node.value,
      code: true,
    } as Descendant;
  }

  if (["strong", "emphasis", "delete"].includes(node.type)) {
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
      .map(item => {
        if (!item) return undefined;
        if (Array.isArray(item)) {
          return item
            .map(child => {
              if (child.type !== "formatted") return undefined;
              return {
                ...child,
                ...attributes,
              };
            })
            .filter(Boolean) as Descendant[];
        }
        if (item.type !== "formatted") return undefined;
        return {
          ...item,
          ...attributes,
        };
      })
      .filter(Boolean)
      .flat() as Descendant[];
  }

  if (node.type === "break" || node.type === "thematicBreak") {
    return {
      type: "divide-line",
      children: [{ type: "formatted", text: "" }],
    } as Descendant;
  }

  if (node.type === "yaml") {
    return {
      type: "front-matter",
      value: node.value,
      children: [{ type: "formatted", text: "" }],
    } as Descendant;
  }

  if (node.type === "footnoteReference") {
    const content = getCurrentParseContext().footnoteDefinitions.get(node.identifier) || "";
    return {
      type: "annotation",
      content,
      children: [{ type: "formatted", text: "" }],
    } as Descendant;
  }

  if (node.type === "footnoteDefinition") {
    return null;
  }

  if (
    parentNode &&
    (parentNode.type === "paragraph" || parentNode.type === "link" || parentNode.type === "heading")
  ) {
    return {
      type: "formatted",
      text: node.value || "",
    } as Descendant;
  }

  return {
    type: "paragraph",
    children: [
      {
        type: "formatted",
        text: node.value,
      },
    ],
  } as Descendant;
};

const normalizeEditorContent = (
  editor: Descendant[],
  result: Descendant[] = [],
  parent: Descendant | null = null
): Descendant[] => {
  for (let i = 0; i < editor.length; i++) {
    const element = editor[i];
    if (element.type !== "formatted" && element.children.length === 0) {
      continue;
    }

    if (element.type === "link" && element.children.some(child => child.type !== "formatted")) {
      while (element.children.some(child => child.type !== "formatted")) {
        element.children.splice(
          element.children.findIndex(child => child.type !== "formatted"),
          1
        );
      }
    } else if (element.type === "paragraph") {
      const firstChild = element.children[0] as unknown as
        | { type?: string; children?: Descendant[] }
        | undefined;
      if (element.children.length === 1 && firstChild && firstChild.type === "image") {
        const onlyChild = firstChild as ImageElement;
        if (onlyChild && Array.isArray(onlyChild.children)) {
          onlyChild.children = [{ type: "formatted", text: "" }];
        }
        result.push(onlyChild as unknown as Descendant);
        continue;
      }

      const paragraphChildren = element.children as unknown as Array<{
        type?: string;
        [key: string]: unknown;
      }>;
      element.children = paragraphChildren.map(child => {
        if (child.type === "image") {
          return {
            type: "inline-image",
            url: child.url as string,
            alt: child.alt as string | undefined,
            uuid: (child.uuid as string | undefined) || uuid(),
            children: [{ type: "formatted", text: "" }],
          };
        }

        if (child.type === "html-block") {
          return {
            type: "html-inline",
            html: child.html as string,
            children: [{ type: "formatted", text: "" }],
          };
        }

        return child;
      }) as unknown as typeof element.children;

      if (element.children.length === 0) {
        continue;
      }
    } else if (
      parent &&
      element.type === "divide-line" &&
      getDescendantChildren(parent)[i + 1]?.type === "divide-line"
    ) {
      continue;
    }

    if (element.type !== "formatted" && "children" in element && Array.isArray(element.children)) {
      element.children = normalizeEditorContent(element.children, [], element);
    }

    result.push(element);
  }

  return result;
};

export interface ImportFromMarkdownOptions {
  /** 业务 directive 解析器（键为 directive 名），返回 null 视为不处理 */
  customDirectives?: Record<
    string,
    (attributes: Record<string, string | undefined>) => Descendant | null
  >;
}

const importFromMarkdownWithCurrentContext = (
  markdown: string,
  ignoreTypes: string[] = []
): Descendant[] => {
  const parseContext = getCurrentParseContext();

  // 历史版本曾为绕过 CJK 加粗解析问题在 markdown 中驻留零宽空格，导入时剥离净化
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

  const collectFootnoteDefinitions = (nodes: typeof parseResult.children) => {
    for (const node of nodes) {
      if (node.type === "footnoteDefinition") {
        const content = extractTextFromNode(node);
        parseContext.footnoteDefinitions.set(node.identifier, content);
      }
    }
  };

  collectFootnoteDefinitions(parseResult.children);

  const editor: Descendant[] = [];

  const dfs = (
    astNodes: MarkdownAstNode[],
    slateResultArray: Descendant[],
    nextIgnoreTypes: string[] = [],
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
        astChildNode.children.some((child: MarkdownAstNode) => child.type === "html")
      ) {
        const index = astChildNode.children.findIndex(
          (child: MarkdownAstNode) => child.type === "html"
        );
        const paragraph = astChildNode.children[index];
        paragraph.type = "text";
      }

      if (nextIgnoreTypes.includes(astChildNode.type)) {
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
          dfs(innerAstNodes, getDescendantChildren(kbdNode), nextIgnoreTypes, astChildNode);
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

      if (Array.isArray(slateNode)) {
        slateResultArray.push(...slateNode);
      } else {
        slateResultArray.push(slateNode);
        if (astChildNode.children && slateNode.type !== "formatted") {
          dfs(
            astChildNode.children,
            getDescendantChildren(slateNode),
            nextIgnoreTypes,
            astChildNode
          );
        }
      }

      astNodeIndex += 1;
    }
  };

  dfs(
    parseResult.children as unknown as MarkdownAstNode[],
    editor,
    [...ignoreTypes, "footnoteDefinition"],
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

  return afterNormalize.length > 0
    ? afterNormalize
    : [
        {
          type: "paragraph",
          children: [{ type: "formatted", text: "" }],
        } as Descendant,
      ];
};

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

export const importFromMarkdown = (
  markdown: string,
  ignoreTypes: string[] = [],
  options?: ImportFromMarkdownOptions
): Descendant[] => {
  parseContextStack.push({
    footnoteDefinitions: new Map(),
    customDirectiveHandlers: new Map(Object.entries(options?.customDirectives ?? {})),
  });
  try {
    return importFromMarkdownWithCurrentContext(markdown, ignoreTypes);
  } finally {
    parseContextStack.pop();
  }
};
