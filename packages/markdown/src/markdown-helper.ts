import type { Descendant } from "slate";
import type { CustomElement, FormattedText } from "./types.ts";
import { markdownSerializerRegistry } from "./markdownSerializerRegistry.ts";
import type { SerializerOutput } from "./markdownSerializerRegistry.ts";
import { PositionMapper } from "./positionMapper.ts";
import type { MarkdownPosition, TextMapping, ElementMapping } from "./positionMapper.ts";

// eslint-disable-next-line no-misleading-character-class
const ZERO_WIDTH_ONLY_REGEX = /^[\u200B\u200C\u200D\uFEFF]+$/;

const isZeroWidthOnlyText = (text: string): boolean => {
  return ZERO_WIDTH_ONLY_REGEX.test(text);
};

export const getMarkdown = (value: Descendant[]): string => {
  // 重置脚注状态
  markdownSerializerRegistry.resetFootnotes();

  const content = value
    .map((element, index) => {
      const isBlockElement = markdownSerializerRegistry.isBlock(element as CustomElement);
      const str = elementToMarkdown(element as CustomElement, null);
      const isLast = index === value.length - 1;
      if (str) {
        return isBlockElement ? `${str}${isLast ? "\n" : "\n\n"}` : str;
      }
      return "";
    })
    .join("");

  // 添加脚注定义
  const footnoteDefinitions = markdownSerializerRegistry.getFootnoteDefinitions();
  return content + footnoteDefinitions;
};

export const leafToMarkdown = (leaf: FormattedText): string => {
  const { text, code, highlight, strikethrough, bold, italic, color, darkColor, textGradient } =
    leaf;
  // 历史版本曾为绕过 CJK 加粗解析问题在文本中驻留零宽空格，导出时剥离兜底
  let str = text.replace(/\u200B/g, "");
  if (code) {
    str = `\`${str}\``;
  }
  if (italic) {
    str = `*${str}*`;
  }
  if (strikethrough) {
    str = `~~${str}~~`;
  }
  if (bold) {
    str = `**${str}**`;
  }
  if (textGradient) {
    str = `:gradient[${str}]{preset=${textGradient}}`;
  } else if (color && darkColor) {
    str = `:color[${str}]{color=${color} darkColor=${darkColor}}`;
  }
  if (highlight && typeof highlight === "string") {
    str = `:highlight[${str}]{color=${highlight}}`;
  }

  return str;
};

export const elementToMarkdown = (
  element: CustomElement,
  parentElement: CustomElement | null
): string => {
  const { type, children } = element;
  const isList = type === "bulleted-list" || type === "numbered-list" || type === "check-list";

  const childrenParts: string[] = [];

  children.forEach((node, index) => {
    if (node.type === "formatted") {
      childrenParts.push(leafToMarkdown(node));
      return;
    }

    const isLast = index === children.length - 1;
    let tail = "";
    if (markdownSerializerRegistry.isBlock(node)) {
      if (isLast) {
        tail = "";
      } else if (isList) {
        tail = "\n";
      } else {
        tail = "\n\n";
      }
    }
    childrenParts.push(elementToMarkdown(node, element) + tail);
  });

  const childrenStr = childrenParts.join("");

  const serializer = markdownSerializerRegistry.getSerializer(type);

  return serializer ? serializer.toMarkdown(element, childrenStr, parentElement) : childrenStr;
};

// ==================== 带位置跟踪的序列化（重新设计版本） ====================

/**
 * 序列化上下文（跟踪当前 Markdown 位置）
 */
interface SerializationContext {
  line: number; // 当前行号
  ch: number; // 当前字符偏移
}

/**
 * 带位置信息的 Markdown 输出
 */
export interface MarkdownWithPositions {
  markdown: string;
  positionMap: PositionMapper;
}

/**
 * 带格式信息的 leaf 序列化结果
 */
interface LeafSerializationResult {
  output: string;
  prefixLength: number;
  suffixLength: number;
}

/**
 * 计算格式标记长度的 leaf 序列化
 */
export function leafToMarkdownStructured(leaf: FormattedText): LeafSerializationResult {
  const { text, code, highlight, strikethrough, bold, italic, color, darkColor, textGradient } =
    leaf;

  // 历史版本曾为绕过 CJK 加粗解析问题在文本中驻留零宽空格，导出时剥离兜底
  let output = text.replace(/\u200B/g, "");
  let prefixLength = 0;
  let suffixLength = 0;

  // 按照嵌套顺序应用格式
  if (code) {
    output = `\`${output}\``;
    prefixLength += 1;
    suffixLength += 1;
  }

  if (italic) {
    output = `*${output}*`;
    prefixLength += 1;
    suffixLength += 1;
  }

  if (strikethrough) {
    output = `~~${output}~~`;
    prefixLength += 2;
    suffixLength += 2;
  }

  if (bold) {
    output = `**${output}**`;
    prefixLength += 2;
    suffixLength += 2;
  }

  if (textGradient) {
    const wrapper = `:gradient[${output}]{preset=${textGradient}}`;
    const beforeBracket = `:gradient[`.length;
    const afterBracket = `]{preset=${textGradient}}`.length;
    output = wrapper;
    prefixLength += beforeBracket;
    suffixLength += afterBracket;
  } else if (color && darkColor) {
    const wrapper = `:color[${output}]{color=${color} darkColor=${darkColor}}`;
    const beforeBracket = `:color[`.length;
    const afterBracket = `]{color=${color} darkColor=${darkColor}}`.length;
    output = wrapper;
    prefixLength += beforeBracket;
    suffixLength += afterBracket;
  }

  if (highlight && typeof highlight === "string") {
    const wrapper = `:highlight[${output}]{color=${highlight}}`;
    const beforeBracket = `:highlight[`.length;
    const afterBracket = `]{color=${highlight}}`.length;
    output = wrapper;
    prefixLength += beforeBracket;
    suffixLength += afterBracket;
  }

  return { output, prefixLength, suffixLength };
}

/**
 * 带位置跟踪的序列化函数（重新设计）
 */
export const getMarkdownWithPositions = (value: Descendant[]): MarkdownWithPositions => {
  const positionMap = new PositionMapper();
  markdownSerializerRegistry.resetFootnotes();

  const context: SerializationContext = { line: 0, ch: 0 };
  const parts: string[] = [];

  value.forEach((element, index) => {
    const isBlockElement = markdownSerializerRegistry.isBlock(element as CustomElement);

    const str = serializeElementWithTracking(
      element as CustomElement,
      null,
      [index],
      context,
      positionMap
    );

    if (str) {
      const isLast = index === value.length - 1;
      const output = isBlockElement ? `${str}${isLast ? "\n" : "\n\n"}` : str;
      parts.push(output);

      // 更新上下文位置
      updateContext(context, output);
    }
  });

  const markdown = parts.join("");

  // 添加脚注定义
  const footnoteDefinitions = markdownSerializerRegistry.getFootnoteDefinitions();

  return {
    markdown: markdown + footnoteDefinitions,
    positionMap,
  };
};

/**
 * 递归序列化元素，同时记录文本节点级别的映射
 */
function serializeElementWithTracking(
  element: CustomElement,
  parentElement: CustomElement | null,
  path: number[],
  context: SerializationContext,
  positionMap: PositionMapper
): string {
  const { type, children } = element;
  const startPos = { ...context };

  // 1. 检查是否为 void 元素
  const isVoid = isVoidElement(type);

  // 2. 如果是 void 元素，直接序列化并记录元素级映射
  if (isVoid) {
    const serializer = markdownSerializerRegistry.getSerializer(type);
    if (!serializer) return "";

    let output: string;
    let serializerOutput: SerializerOutput | null = null;

    if (serializer.toMarkdownStructured) {
      serializerOutput = serializer.toMarkdownStructured(element, "", parentElement);
      output = serializerOutput.output;
    } else {
      output = serializer.toMarkdown(element, "", parentElement);
    }

    // 计算结束位置
    const endPos = { ...startPos };
    updateContext(endPos, output);

    // 记录元素映射
    const elementMapping: ElementMapping = {
      type: "element",
      slateElementPath: path,
      elementType: type,
      isVoid: true,
      mdStartLine: startPos.line,
      mdStartCh: startPos.ch,
      mdEndLine: endPos.line,
      mdEndCh: endPos.ch,
      propertyMappings: serializerOutput?.propertyMappings
        ? convertPropertyMappings(serializerOutput.propertyMappings, startPos, element)
        : undefined,
    };

    positionMap.addElementMapping(elementMapping);

    return output;
  }

  // 3. 非 void 元素：递归处理子节点
  const isList = type === "bulleted-list" || type === "numbered-list" || type === "check-list";
  const isTable = type === "table";

  const childrenParts: string[] = [];
  const childContext = { ...context };

  children.forEach((node, index) => {
    if (node.type === "formatted") {
      if (isZeroWidthOnlyText(node.text || "")) {
        const textPath = [...path, index];
        const leafStart = { ...childContext };
        const textMapping: TextMapping = {
          type: "text",
          slateTextPath: textPath,
          slateOffset: 0,
          slateLength: 0,
          mdLine: leafStart.line,
          mdCh: leafStart.ch,
          mdLength: 0,
          prefixLength: 0,
          suffixLength: 0,
        };
        positionMap.addTextMapping(textMapping);
        return;
      }

      // 文本节点：记录文本级映射
      const textPath = [...path, index];
      const leafStart = { ...childContext };

      const { output, prefixLength, suffixLength } = leafToMarkdownStructured(node);

      childrenParts.push(output);

      // 记录文本映射
      const textMapping: TextMapping = {
        type: "text",
        slateTextPath: textPath,
        slateOffset: 0,
        slateLength: node.text.length,
        mdLine: leafStart.line,
        mdCh: leafStart.ch,
        mdLength: output.length,
        prefixLength,
        suffixLength,
      };

      positionMap.addTextMapping(textMapping);

      updateContext(childContext, output);
    } else {
      // 子元素：递归序列化
      const isLast = index === children.length - 1;
      const childPath = [...path, index];

      const childStr = serializeElementWithTracking(
        node,
        element,
        childPath,
        childContext,
        positionMap
      );

      let tail = "";
      if (markdownSerializerRegistry.isBlock(node)) {
        if (isLast) {
          tail = "";
        } else if (isList) {
          tail = "\n";
        } else if (isTable) {
          tail = "\n";
        } else {
          tail = "\n\n";
        }
      }

      const output = childStr + tail;
      childrenParts.push(output);
      updateContext(childContext, output);
    }
  });

  const childrenStr = childrenParts.join("");

  // 4. 调用序列化器
  const serializer = markdownSerializerRegistry.getSerializer(type);
  if (!serializer) {
    return childrenStr;
  }

  let output: string;
  let serializerOutput: SerializerOutput | null = null;
  if (serializer.toMarkdownStructured) {
    serializerOutput = serializer.toMarkdownStructured(element, childrenStr, parentElement);
    output = serializerOutput.output;

    // 处理 childrenStart 和 perLineOffset，调整子节点的映射
    if (serializerOutput.childrenStart || serializerOutput.perLineOffset) {
      positionMap.adjustChildMappings(
        path,
        serializerOutput.childrenStart || { line: 0, ch: 0 },
        serializerOutput.perLineOffset,
        startPos.line
      );
    }

    if (serializerOutput.childLineShifts) {
      serializerOutput.childLineShifts.forEach(shift => {
        positionMap.shiftLinesForChildren(path, shift.startIndex, shift.lineDelta);
      });
    }
  } else {
    output = serializer.toMarkdown(element, childrenStr, parentElement);
  }

  if (
    serializerOutput?.childrenStart &&
    !serializerOutput.perLineOffset &&
    !output.includes("\n")
  ) {
    const wrapperPrefixLength = serializerOutput.childrenStart.ch;
    const wrapperSuffixLength = Math.max(
      0,
      output.length - childrenStr.length - wrapperPrefixLength
    );
    positionMap.adjustChildMappingsForInlineWrapper(path, wrapperPrefixLength, wrapperSuffixLength);
  }

  return output;
}

/**
 * 更新序列化上下文（根据输出字符串计算新位置）
 */
function updateContext(context: SerializationContext, output: string): void {
  const lines = output.split("\n");

  if (lines.length === 1) {
    // 单行输出
    context.ch += output.length;
  } else {
    // 多行输出
    context.line += lines.length - 1;
    context.ch = lines[lines.length - 1].length;
  }
}

/**
 * 判断元素类型是否为 void
 */
function isVoidElement(type: string): boolean {
  const voidTypes = new Set([
    "code-block",
    "image",
    "inline-image",
    "video",
    "audio",
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
}

/**
 * 转换属性映射（相对位置 → 绝对位置）
 */
function convertPropertyMappings(
  propertyMappings: SerializerOutput["propertyMappings"],
  basePos: MarkdownPosition,
  element: CustomElement
): ElementMapping["propertyMappings"] {
  if (!propertyMappings) return {};

  const result: any = {};

  for (const [propName, mapping] of Object.entries(propertyMappings)) {
    const propValue =
      typeof element[propName as keyof CustomElement] === "string"
        ? String(element[propName as keyof CustomElement])
        : "";
    const lines = propValue.split("\n");
    const isMultiline = mapping.multiline && lines.length > 1;
    const endLineOffset = isMultiline ? lines.length - 1 : 0;
    const endChOffset = isMultiline ? lines[lines.length - 1].length : propValue.length;

    result[propName] = {
      mdStartLine: basePos.line + mapping.start.line,
      mdStartCh: mapping.start.line === 0 ? basePos.ch + mapping.start.ch : mapping.start.ch,
      mdEndLine: basePos.line + mapping.start.line + endLineOffset,
      mdEndCh:
        endLineOffset === 0
          ? (mapping.start.line === 0 ? basePos.ch + mapping.start.ch : mapping.start.ch) +
            endChOffset
          : endChOffset,
    };
  }

  return result;
}
