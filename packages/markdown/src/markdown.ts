import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkCjkFriendly from "remark-cjk-friendly/parseOnly";
import remarkCjkFriendlyGfmStrikethrough from "remark-cjk-friendly-gfm-strikethrough/parseOnly";
import remarkMath from "remark-math";
import remarkDirective from "remark-directive";
import remarkRehype from "remark-rehype";
import {
  UNKNOWN_NODE_DIRECTIVE,
  isRestoredNode,
  markRestored,
  parseUnknownNode,
} from "./unknownNode.ts";
import remarkFrontmatter from "remark-frontmatter";
import type { Descendant } from "slate";
import { visit } from "unist-util-visit";
import type { FormattedText } from "./types.ts";
import type { MarkdownTextRegistry } from "./textCodec.ts";
import { encodeTextLabel, UNKNOWN_TEXT_PREFIX } from "./unknownText.ts";
import { PositionMapper } from "./positionMapper.ts";
import type { ElementMapping, MarkdownPosition, TextMapping } from "./positionMapper.ts";

import type { CustomDirectiveHandler, MarkdownCodec } from "./codec.ts";

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

const getNodeType = (node: Descendant): string =>
  "type" in node && typeof node.type === "string" ? node.type : "";

const isFormattedNode = (node: Descendant): node is FormattedText =>
  getNodeType(node) === "formatted";

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

const htmlTag = (node: MarkdownAstNode, closing = false): string | null => {
  if (node.type !== "html" || typeof node.value !== "string") return null;
  const pattern = closing ? /^<\/([a-z][a-z0-9-]*)>$/i : /^<([a-z][a-z0-9-]*)(?:\s+[^>]*)?>$/i;
  return node.value.trim().match(pattern)?.[1].toLowerCase() ?? null;
};

const findMatchingHtmlCloseIndex = (
  astNodes: MarkdownAstNode[],
  startIndex: number,
  tag: string
) => {
  let depth = 0;
  for (let i = startIndex; i < astNodes.length; i++) {
    const node = astNodes[i];
    if (htmlTag(node) === tag) {
      depth += 1;
      continue;
    }
    if (htmlTag(node, true) === tag) {
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
  if (restored && isFormattedNode(restored) && node.type !== "textDirective") return null;
  return restored ? markRestored(restored) : null;
};

const markdownToDescendant = (
  node: MarkdownAstNode,
  parentAstNode: unknown = null,
  astChildrenOfParent: unknown[] = []
): Descendant | Descendant[] | null => {
  if (node.type.endsWith("Directive") && node.name === UNKNOWN_NODE_DIRECTIVE) {
    const restored = restoreUnknownNode(node);
    if (restored) return restored;
  }
  const parentNode = isMarkdownAstNode(parentAstNode) ? (parentAstNode as MarkdownAstNode) : null;
  const siblingNodes = astChildrenOfParent as MarkdownAstNode[];

  // codec 认领（优先于内置分支）：围栏语言查表，其余按声明顺序问 importNode。
  // directive 节点不经这里——它们的机制是 codec.directives（下方专门分支）
  const parseContext = getCurrentParseContext();
  if (node.type === "code") {
    const fence = parseContext.fenceByLanguage.get((node.lang ?? "").trim().toLowerCase());
    if (fence) {
      return {
        type: fence.type,
        [fence.property]: node.value,
        children: [{ type: "formatted", text: "" }],
      } as unknown as Descendant;
    }
  }
  if (!node.type.endsWith("Directive")) {
    for (const claim of parseContext.importNodes) {
      const claimed = claim(node, {
        parent: parentNode,
        siblings: siblingNodes,
        getFootnote: identifier => parseContext.footnoteDefinitions.get(identifier) || "",
      });
      if (claimed) return claimed;
    }
  }

  if (node.type === "containerDirective") {
    const customContainerHandler = getCurrentParseContext().customDirectiveHandlers.get(node.name);
    if (customContainerHandler) {
      return customContainerHandler(node.attributes || {});
    }
    return null;
  }

  if (node.type === "text") {
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
    const customTextHandler = getCurrentParseContext().customDirectiveHandlers.get(node.name);
    if (customTextHandler) {
      return customTextHandler(node.attributes || {});
    }
    return { type: "formatted", text: `:${node.name}` };
  } else if (node.type === "footnoteDefinition") {
    // 脚注定义已经在第一次遍历中处理了，这里忽略；引用式链接定义（definition）
    // 同理——内容已折进 link 节点，此前落入未知兜底会造出 text 为 undefined 的
    // 文本节点，导出即崩（差分语料发现，两侧共有的既有缺陷，修复为忽略）
    return null;
  } else if (node.type === "definition") {
    return null;
  } else {
    if (
      parentNode &&
      (parentNode.type === "paragraph" ||
        parentNode.type === "link" ||
        parentNode.type === "heading")
    ) {
      return {
        type: "formatted",
        text: node.value || extractTextFromNode(node),
      };
    }
    return {
      type: "paragraph",
      children: node.children?.length ? [] : [{ type: "formatted", text: node.value || "" }],
    } as Descendant;
  }
};

export interface ImportFromMarkdownOptions {
  /** 宿主注册的业务 directive（container / leaf / text 三种都查），优先于内置分支 */
  customDirectives?: Record<string, CustomDirectiveHandler>;
}

/** 单次导入的解析上下文：随导入调用入栈 / 出栈，嵌套导入（handler 内再次导入）互不干扰 */
interface MarkdownParseContext {
  textRegistry: MarkdownTextRegistry;
  footnoteDefinitions: Map<string, string>;
  customDirectiveHandlers: Map<string, CustomDirectiveHandler>;
  /** 位置映射只记元素级范围的类型 */
  voidTypes: ReadonlySet<string>;
  /** 子文本按整体范围记前后缀的 text directive 名 */
  inlineWrapperDirectives: ReadonlySet<string>;
  inlineHtmlWrappers: ReadonlyMap<string, NonNullable<MarkdownCodec["inlineHtmlWrapper"]>>;
  /** 围栏语言 → 认领该语言的元素（type + 源码字段名） */
  fenceByLanguage: ReadonlyMap<string, { type: string; property: string }>;
  /** 通用 mdast 认领（按声明顺序，首个认领生效） */
  importNodes: readonly NonNullable<MarkdownCodec["importNode"]>[];
  /** code 节点认领方的源码属性（导入侧属性级映射用） */
  fenceSourceProperties: ReadonlyMap<string, string>;
  /** 导入后规范化钩子（按元素类型） */
  normalizeHooks: ReadonlyMap<string, NonNullable<MarkdownCodec["normalize"]>>;
  /** 块级元素的段落内行内形态 */
  inlineForms: ReadonlyMap<string, NonNullable<MarkdownCodec["inlineForm"]>>;
}

/** 处理器级配置：宿主 codec 合并后的结果（框架不自带任何元素类型） */
export interface ImportConfig {
  textRegistry: MarkdownTextRegistry;
  directives: Record<string, CustomDirectiveHandler>;
  voidTypes: ReadonlySet<string>;
  inlineWrapperDirectives: ReadonlySet<string>;
  inlineHtmlWrappers?: ReadonlyMap<string, NonNullable<MarkdownCodec["inlineHtmlWrapper"]>>;
  fenceByLanguage: ReadonlyMap<string, { type: string; property: string }>;
  importNodes?: readonly NonNullable<MarkdownCodec["importNode"]>[];
  fenceSourceProperties?: ReadonlyMap<string, string>;
  normalizeHooks?: ReadonlyMap<string, NonNullable<MarkdownCodec["normalize"]>>;
  inlineForms?: ReadonlyMap<string, NonNullable<MarkdownCodec["inlineForm"]>>;
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
    textRegistry: config.textRegistry,
    footnoteDefinitions: new Map(),
    // 调用时传入的 customDirectives 覆盖处理器级 codec
    customDirectiveHandlers: new Map(
      Object.entries({ ...config.directives, ...options?.customDirectives })
    ),
    voidTypes: config.voidTypes,
    inlineWrapperDirectives: config.inlineWrapperDirectives,
    inlineHtmlWrappers: config.inlineHtmlWrappers ?? new Map(),
    fenceByLanguage: config.fenceByLanguage ?? new Map(),
    importNodes: config.importNodes ?? [],
    fenceSourceProperties: config.fenceSourceProperties ?? new Map(),
    normalizeHooks: config.normalizeHooks ?? new Map(),
    inlineForms: config.inlineForms ?? new Map(),
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

type MarkContext = Readonly<Record<string, unknown>>;

const applyMarks = (node: Descendant, marks: MarkContext): Descendant => {
  if (!isFormattedNode(node) || isRestoredNode(node)) return node;
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

const createMarkdownParser = () =>
  unified()
    .use(remarkParse)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(remarkHtmlProcessor)
    .use(remarkGfm)
    .use(remarkCjkFriendly)
    .use(remarkCjkFriendlyGfmStrikethrough)
    .use(remarkMath)
    .use(remarkDirective)
    .use(remarkFrontmatter, ["yaml"]);

const importWithPositionsInContext = (
  markdown: string,
  ignoreTypes: string[],
  trackPositions = true
): SlateWithPositions => {
  const footnoteDefinitions = getCurrentParseContext().footnoteDefinitions;

  const positionMap = new PositionMapper();

  const parseResult = createMarkdownParser().parse(markdown);

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

      const isCarrier =
        astChildNode.type.endsWith("Directive") && astChildNode.name === UNKNOWN_NODE_DIRECTIVE;
      const restored = isCarrier ? restoreUnknownNode(astChildNode) : null;
      if (
        isCarrier &&
        astChildNode.type === "textDirective" &&
        (!restored || isFormattedNode(restored))
      ) {
        const start = toMarkdownPosition(astChildNode.position?.start);
        const end = toMarkdownPosition(astChildNode.position?.end);
        const startOffset = getOffset(astChildNode.position?.start);
        const endOffset = getOffset(astChildNode.position?.end);
        const raw =
          startOffset !== null && endOffset !== null
            ? markdown.slice(startOffset, endOffset)
            : `:${UNKNOWN_NODE_DIRECTIVE}`;
        const item = restored ?? { type: "formatted" as const, text: raw, ...markContext };
        const path = [...parentPath, slateResultArray.length];
        slateResultArray.push(item);
        if (trackPositions) {
          const text = getFormattedText(item);
          const encoded = encodeTextLabel(text);
          const canonicalLabel =
            Boolean(restored) &&
            raw.startsWith(UNKNOWN_TEXT_PREFIX + encoded.label + "]") &&
            start.line === end.line;
          const sourceOffsets = canonicalLabel
            ? encoded.offsets.map(offset => UNKNOWN_TEXT_PREFIX.length + offset)
            : undefined;
          const exactLiteral = !restored && start.line === end.line;
          positionMap.addTextMapping({
            type: "text",
            slateTextPath: path,
            slateOffset: 0,
            slateLength: text.length,
            mdLine: start.line,
            mdCh: start.ch,
            mdLength: raw.length,
            prefixLength: canonicalLabel ? UNKNOWN_TEXT_PREFIX.length : 0,
            suffixLength: canonicalLabel
              ? raw.length - UNKNOWN_TEXT_PREFIX.length - encoded.label.length
              : 0,
            ...(sourceOffsets ? { sourceOffsets } : {}),
            ...(!canonicalLabel && !exactLiteral ? { opaque: true, mdEnd: end } : {}),
          });
        }
        astNodeIndex += 1;
        continue;
      }

      const tag = htmlTag(astChildNode);
      const htmlWrapper = tag ? getCurrentParseContext().inlineHtmlWrappers.get(tag) : undefined;
      if (htmlWrapper && tag) {
        const closeIndex = findMatchingHtmlCloseIndex(astNodes, astNodeIndex, tag);
        if (closeIndex > astNodeIndex) {
          const closeNode = astNodes[closeIndex];
          const innerAstNodes = astNodes.slice(astNodeIndex + 1, closeIndex);
          const slateNode = htmlWrapper.create(astChildNode);

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

      const textClaim = restored ? null : getCurrentParseContext().textRegistry.claim(astChildNode);
      if (textClaim?.rule.content === "children") {
        dfsWithPositions(
          astChildNode.children || [],
          slateResultArray,
          ignoreTypes,
          astChildNode,
          parentPath,
          { ...markContext, ...textClaim.marks },
          textClaim.rule.position === "inherit" ? wrapperPosition : astChildNode.position
        );
        astNodeIndex += 1;
        continue;
      }

      if (astChildNode.type === "text" && !textClaim) {
        const slateNode: Descendant = {
          type: "formatted",
          text: astChildNode.value || "",
          ...markContext,
        };

        const insertIndex = slateResultArray.length;
        slateResultArray.push(slateNode);
        const slatePath = [...parentPath, insertIndex];

        const mapping = trackPositions
          ? buildTextMapping({
              slateTextPath: slatePath,
              text: astChildNode.value || "",
              textPosition: astChildNode.position,
              wrapperPosition,
            })
          : null;
        if (mapping) {
          positionMap.addTextMapping(mapping);
        }
        astNodeIndex += 1;
        continue;
      }

      if (textClaim?.rule.content === "value") {
        const slateNode: Descendant = {
          type: "formatted",
          text: astChildNode.value || "",
          ...markContext,
          ...textClaim.marks,
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

        const mapping = trackPositions
          ? buildTextMapping({
              slateTextPath: slatePath,
              text: astChildNode.value || "",
              textPosition: astChildNode.position,
              wrapperPosition: astChildNode.position,
              prefixLengthOverride: prefixLength,
              suffixLengthOverride: suffixLength,
            })
          : null;
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

        if (isFormattedNode(node)) {
          const mapping = trackPositions
            ? buildTextMapping({
                slateTextPath: slatePath,
                text: getFormattedText(node),
                textPosition: astChildNode.position,
                wrapperPosition,
              })
            : null;
          if (mapping) {
            positionMap.addTextMapping(mapping);
          }
        } else if (
          trackPositions &&
          astChildNode.position &&
          (isVoidSlateElementType(getNodeType(node)) || isRestoredNode(node))
        ) {
          const mdStart = toMarkdownPosition(astChildNode.position.start);
          const mdEnd = toMarkdownPosition(astChildNode.position.end);
          const elementMapping: ElementMapping = {
            type: "element",
            slateElementPath: slatePath,
            elementType: getNodeType(node),
            isVoid: true,
            mdStartLine: mdStart.line,
            mdStartCh: mdStart.ch,
            mdEndLine: mdEnd.line,
            mdEndCh: mdEnd.ch,
          };

          // codec 声明了源码属性（fenceSourceProperty）的 code 认领方，补属性级映射
          const sourceProperty =
            astChildNode.type === "code"
              ? getCurrentParseContext().fenceSourceProperties.get(getNodeType(node))
              : undefined;
          if (sourceProperty) {
            const code = astChildNode.value || "";
            const lines = code.split("\n");
            const codeStartLine = mdStart.line + 1;
            const codeEndLine = codeStartLine + Math.max(0, lines.length - 1);
            const codeStartCh = mdStart.ch;
            const codeEndCh =
              lines.length > 0 ? codeStartCh + lines[lines.length - 1].length : codeStartCh;
            elementMapping.propertyMappings = {
              [sourceProperty]: {
                mdStartLine: codeStartLine,
                mdStartCh: codeStartCh,
                mdEndLine: codeEndLine,
                mdEndCh: codeEndCh,
              },
            };
          }

          positionMap.addElementMapping(elementMapping);
        }

        if (astChildNode.children && !isFormattedNode(node) && !isRestoredNode(node)) {
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
          } as Descendant,
        ];

  if (trackPositions) positionMap.pruneInvalidPaths(path => isPathInNodes(content, path));

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

const importInContext = (markdown: string, ignoreTypes: string[]): Descendant[] =>
  importWithPositionsInContext(markdown, ignoreTypes, false).content;

const normalizeEditorContent = (
  editor: Descendant[],
  result: Descendant[] = [],
  parent: Descendant | null = null
): Descendant[] => {
  const { normalizeHooks, inlineForms } = getCurrentParseContext();
  const demote = (child: Descendant): Descendant => {
    const inlineForm = inlineForms.get((child as { type?: string }).type ?? "");
    return inlineForm ? inlineForm(child) : child;
  };

  for (let i = 0; i < editor.length; i++) {
    const element = editor[i];
    // 兜底还原的节点保持原样（ER-006）
    if (isRestoredNode(element)) {
      result.push(element);
      continue;
    }
    if (!isFormattedNode(element) && getDescendantChildren(element).length === 0) {
      continue;
    }
    const normalize = normalizeHooks.get(getNodeType(element));
    if (normalize) {
      const replacement = normalize(element, {
        parent,
        previousSibling: editor[i - 1] ?? null,
        nextSibling: editor[i + 1] ?? null,
        demote,
      });
      if (replacement) {
        // 钩子返回即定论：不再做子树递归与空检查（规则自己负责形状）
        for (const item of replacement) {
          result.push(item);
        }
        continue;
      }
    }
    if (!isFormattedNode(element) && "children" in element) {
      const container = element as { children: Descendant[] };
      container.children = normalizeEditorContent(getDescendantChildren(element), [], element);
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
