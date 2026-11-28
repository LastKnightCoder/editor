import { PositionMapper, type TextMapping, type ElementMapping } from "../positionMapper.ts";
import {
  TAU_MARKDOWN_HEADER,
  assertContent,
  isRecord,
  isPlainTauInlineText,
  parseObject,
  setOwn,
  tauLimits,
  type TauMarkdownDecoded,
  type TauMarkdownOptions,
} from "./format.ts";

export function decodeTauMarkdown(
  markdown: string,
  options: TauMarkdownOptions = {}
): TauMarkdownDecoded {
  const limits = tauLimits(options);
  if (markdown.length > limits.maxChars) throw new Error("Tau Markdown 文本容量超限");
  const lines = markdown.split("\n");
  const offsets: number[] = [];
  let total = 0;
  for (const line of lines) {
    offsets.push(total);
    total += line.length + 1;
  }
  const syntax = (index: number) => (lines[index] ?? "").replace(/\r$/, "");
  const endOf = (index: number) => offsets[index] + syntax(index).length;
  const position = (offset: number) => {
    let low = 0,
      high = offsets.length;
    while (low + 1 < high) {
      const middle = (low + high) >>> 1;
      if (offsets[middle] <= offset) low = middle;
      else high = middle;
    }
    return { line: low, ch: offset - offsets[low] };
  };
  const positionMap = new PositionMapper();
  const blockRanges: { start: number; end: number }[] = [];
  let cursor = 0,
    count = 0;
  let metadata: Record<string, unknown> = {};
  const fail = (message: string): never => {
    throw new Error("Tau Markdown 第 " + (cursor + 1) + " 行：" + message);
  };
  const skipBlank = () => {
    while (cursor < lines.length && !syntax(cursor).trim()) cursor++;
  };
  const frame = () => {
    const opening = /^(\u0060{3,})(tau-[a-z-]+)(?: (.*))?$/.exec(syntax(cursor));
    if (!opening) return fail("无效的围栏");
    const start = offsets[cursor] + lines[cursor].length + 1;
    const line = cursor + 1;
    const attributes = opening[3] ? parseObject(opening[3]) : {};
    const fence = opening[1];
    let closing = cursor + 1;
    while (closing < lines.length && syntax(closing).trimEnd() !== fence) closing++;
    if (closing === lines.length) return fail("围栏没有结束");
    const end = Math.max(start, offsets[closing] - 1);
    const raw = markdown.slice(start, end);
    const json = opening[2].endsWith("-json");
    const decoded: unknown = json ? JSON.parse(raw) : raw;
    if (typeof decoded !== "string") return fail("字面量载体必须还原为字符串");
    cursor = closing + 1;
    return {
      kind: opening[2].replace(/-json$/, ""),
      text: decoded,
      raw,
      json,
      attributes,
      start,
      end,
      line,
      closing,
    };
  };
  const addText = (value: ReturnType<typeof frame>, path: number[]) => {
    const mapping: TextMapping = {
      type: "text",
      slateTextPath: path,
      slateOffset: 0,
      slateLength: value.text.length,
      mdLine: value.line,
      mdCh: 0,
      mdLength: value.raw.length,
      prefixLength: value.json ? 1 : 0,
      suffixLength: value.json ? 1 : 0,
      mdEnd: position(value.end),
    };
    if (value.json) {
      const boundaries = [1];
      for (let index = 1; index < value.raw.length - 1;) {
        index += value.raw[index] === "\\" ? (value.raw[index + 1] === "u" ? 6 : 2) : 1;
        boundaries.push(index);
      }
      mapping.sourceOffsets = boundaries;
    } else {
      const sourceLines = [];
      let offset = 0,
        line = value.line;
      for (const text of value.text.split("\n")) {
        sourceLines.push({ line: line++, ch: 0, offset, length: text.length });
        offset += text.length + 1;
      }
      mapping.sourceLines = sourceLines;
    }
    positionMap.addTextMapping(mapping);
  };
  const inline = (value: ReturnType<typeof frame>, parent: number[], first: number) => {
    if (isPlainTauInlineText(value.text)) {
      addText(value, [...parent, first]);
      return [{ type: "formatted", text: value.text }];
    }
    if (!options.processor) return fail("当前处理器没有行内 Markdown 编解码");
    const parsed = options.processor.importFromMarkdownWithPositions(value.text);
    const node: unknown = parsed.content[0];
    if (
      parsed.content.length !== 1 ||
      !isRecord(node) ||
      node.type !== "paragraph" ||
      !Array.isArray(node.children)
    )
      return fail("tau-inline 只能包含一个行内段落");
    const path = (source: number[]) => [...parent, first + source[1], ...source.slice(2)];
    for (const mapping of parsed.positionMap.getMappings()) {
      if (mapping.type === "text") {
        if (mapping.slateTextPath[0] !== 0 || mapping.slateTextPath.length < 2) continue;
        positionMap.addTextMapping({
          ...mapping,
          slateTextPath: path(mapping.slateTextPath),
          mdLine: mapping.mdLine + value.line,
          ...(mapping.mdEnd
            ? { mdEnd: { ...mapping.mdEnd, line: mapping.mdEnd.line + value.line } }
            : {}),
          ...(mapping.sourceLines
            ? {
                sourceLines: mapping.sourceLines.map(line => ({
                  ...line,
                  line: line.line + value.line,
                })),
              }
            : {}),
        });
      } else {
        if (mapping.slateElementPath[0] !== 0 || mapping.slateElementPath.length < 2) continue;
        const lifted: ElementMapping = {
          ...mapping,
          slateElementPath: path(mapping.slateElementPath),
          mdStartLine: mapping.mdStartLine + value.line,
          mdEndLine: mapping.mdEndLine + value.line,
        };
        if (mapping.propertyMappings)
          lifted.propertyMappings = Object.fromEntries(
            Object.entries(mapping.propertyMappings).map(([key, range]) => [
              key,
              {
                ...range,
                mdStartLine: range.mdStartLine + value.line,
                mdEndLine: range.mdEndLine + value.line,
              },
            ])
          );
        positionMap.addElementMapping(lifted);
      }
    }
    return node.children;
  };
  const readNode = (path: number[], depth: number): unknown[] => {
    if (++count > limits.maxNodes || depth > limits.maxDepth) return fail("节点数量或层级超限");
    const line = syntax(cursor);
    if (line.startsWith(":::tau ")) {
      const startLine = cursor;
      const node = parseObject(line.slice(7));
      if (typeof node.type !== "string" || !node.type || Object.hasOwn(node, "children"))
        return fail("元素属性头无效或重复声明 children");
      cursor++;
      const children: unknown[] = [];
      const properties: NonNullable<ElementMapping["propertyMappings"]> = {};
      while (cursor < lines.length) {
        skipBlank();
        if (syntax(cursor) === ":::") {
          const endLine = cursor++;
          setOwn(node, "children", children);
          positionMap.addElementMapping({
            type: "element",
            slateElementPath: path,
            elementType: node.type,
            isVoid: false,
            mdStartLine: startLine,
            mdStartCh: 0,
            mdEndLine: endLine,
            mdEndCh: 3,
            propertyMappings: properties,
          });
          return [node];
        }
        if (/^\u0060{3,}tau-field(?:-json)? /.test(syntax(cursor))) {
          const value = frame();
          const key = value.attributes.key;
          if (
            typeof key !== "string" ||
            !key ||
            key === "type" ||
            key === "children" ||
            Object.hasOwn(node, key) ||
            Object.keys(value.attributes).length !== 1
          )
            return fail("字符串属性重复或无效");
          setOwn(node, key, value.text);
          properties[key] = {
            mdStartLine: value.line,
            mdStartCh: value.json ? 1 : 0,
            mdEndLine: position(value.end).line,
            mdEndCh: position(value.end).ch - (value.json ? 1 : 0),
          };
        } else if (/^\u0060{3,}tau-inline(?: |$)/.test(syntax(cursor))) {
          const value = frame();
          if (Object.keys(value.attributes).length) return fail("tau-inline 不接受属性头");
          children.push(...inline(value, path, children.length));
        } else {
          children.push(...readNode([...path, children.length], depth + 1));
        }
      }
      return fail("元素容器没有结束");
    }
    if (/^\u0060{3,}tau-text(?:-json)?(?: |$)/.test(line)) {
      const value = frame();
      if (Object.hasOwn(value.attributes, "text") || Object.hasOwn(value.attributes, "children"))
        return fail("文本字段重复");
      const leaf = value.attributes;
      setOwn(leaf, "text", value.text);
      addText(value, path);
      return [leaf];
    }
    return fail("预期节点容器或文本载体");
  };
  skipBlank();
  if (syntax(cursor).startsWith("<!-- tau-markdown:")) {
    if (syntax(cursor) !== TAU_MARKDOWN_HEADER) return fail("不支持的协议版本");
    cursor++;
    skipBlank();
    if (/^\u0060{3,}tau-meta(?: |$)/.test(syntax(cursor))) {
      const value = frame();
      if (Object.keys(value.attributes).length) return fail("tau-meta 不接受属性头");
      metadata = parseObject(value.text);
    }
  } else if (!options.fragment) return fail("缺少协议版本头");
  const content: unknown[] = [];
  while (cursor < lines.length) {
    skipBlank();
    if (cursor === lines.length) break;
    const start = offsets[cursor];
    content.push(...readNode([content.length], 0));
    blockRanges.push({ start, end: endOf(cursor - 1) });
  }
  assertContent(content, limits);
  return { content, metadata, markdown, positionMap, blockRanges };
}
