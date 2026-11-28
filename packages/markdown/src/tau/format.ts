import type { Descendant } from "slate";
import type { MarkdownProcessor } from "../processor.ts";
import type { MarkdownWithPositions } from "../markdown-helper.ts";

export const TAU_MARKDOWN_HEADER = "<!-- tau-markdown:1 -->";
export const TAU_MARKDOWN_HELP =
  "Tau Markdown v1: :::tau 后的 JSON 是完整节点属性，独立 ::: 结束节点。" +
  "tau-inline 围栏内是行内 Markdown；tau-text/tau-field 围栏内是原始文字/字符串属性，" +
  "反引号围栏长度必须大于正文中的反引号串；-json 后缀表示 JSON 字符串。" +
  "保留无关属性、collabId、tauContract 和 tau-meta；修改颜色直接修改行节点 color，清色删除 color。" +
  "完整节点用 locator:{kind:block-id,blockId:原文collabId} 定位，可先按 blockId 读取其完整源；局部替换先用读取的 snapshotId 查找，编辑使用同一快照。不要手算 Markdown 行号。" +
  "已有块必须保持 Tau 结构，全文替换保留版本头及元信息；不能改写成普通 GFM。";

export interface TauMarkdownLimits {
  maxChars: number;
  maxNodes: number;
  maxDepth: number;
}
export interface TauMarkdownOptions {
  processor?: MarkdownProcessor;
  metadata?: Record<string, unknown>;
  fragment?: boolean;
  limits?: Partial<TauMarkdownLimits>;
}
export interface TauMarkdownDecoded extends MarkdownWithPositions {
  content: Descendant[];
  metadata: Record<string, unknown>;
}
export const DEFAULT_TAU_LIMITS: TauMarkdownLimits = {
  maxChars: 32 * 1024 * 1024,
  maxNodes: 150_000,
  maxDepth: 64,
};
export const tauLimits = (options: TauMarkdownOptions) => {
  const limits = { ...DEFAULT_TAU_LIMITS, ...options.limits };
  if (Object.values(limits).some(value => !Number.isSafeInteger(value) || value < 1))
    throw new Error("Tau Markdown 限制无效");
  return limits;
};
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

export function jsonText(value: unknown, depth = 0, ancestors = new Set<object>()): string {
  if (depth > 64) throw new Error("Tau Markdown 属性层级超限");
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value))
    return Object.is(value, -0) ? "-0" : String(value);
  if (!value || typeof value !== "object" || ancestors.has(value))
    throw new Error("Tau Markdown 只接受无循环的 JSON 数据");
  if (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
    throw new Error("Tau Markdown 属性必须是普通 JSON 对象");
  ancestors.add(value);
  const result = Array.isArray(value)
    ? "[" + Array.from(value, item => jsonText(item, depth + 1, ancestors)).join(",") + "]"
    : "{" +
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => JSON.stringify(key) + ":" + jsonText(item, depth + 1, ancestors))
        .join(",") +
      "}";
  ancestors.delete(value);
  return result;
}

export function sameJson(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) || Array.isArray(right))
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => sameJson(item, right[index]))
    );
  const a = Object.entries(left).filter(([, value]) => value !== undefined);
  const b = Object.entries(right).filter(([, value]) => value !== undefined);
  return (
    a.length === b.length &&
    a.every(([key, value]) => Object.hasOwn(right, key) && sameJson(value, Reflect.get(right, key)))
  );
}

/** 原生行内协议的无语法字面量子集，不经过宿主自定义语法重解释。 */
export function isPlainTauInlineText(text: string): boolean {
  return (
    !!text &&
    text.trim() === text &&
    isWellFormed(text) &&
    // 控制字符必须离开字面量快路径，避免 Markdown 解析规范化原文。
    // eslint-disable-next-line no-control-regex
    !/[\u0000-\u001f\u007f-\u009f\u200b-\u200d\u2028\u2029\ufeff\u0021-\u002f\u003a-\u0040\u005b-\u0060\u007b-\u007e]/u.test(
      text
    )
  );
}

export function isWellFormed(text: string): boolean {
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(++index);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}
export function fenceFor(text: string): string {
  let longest = 0,
    current = 0;
  for (const char of text) {
    current = char === "\u0060" ? current + 1 : 0;
    longest = Math.max(longest, current);
  }
  return "\u0060".repeat(Math.max(3, longest + 1));
}
export function setOwn(target: Record<string, unknown>, key: string, value: unknown) {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}
export function assertContent(
  value: unknown,
  limits: TauMarkdownLimits
): asserts value is Descendant[] {
  if (!Array.isArray(value)) throw new Error("Tau Markdown 正文必须是节点数组");
  let count = 0;
  const visit = (node: unknown, depth: number) => {
    if (++count > limits.maxNodes || depth > limits.maxDepth)
      throw new Error("Tau Markdown 节点数量或层级超限");
    if (!isRecord(node)) throw new Error("Tau Markdown 节点无效");
    if (Array.isArray(node.children)) {
      if (typeof node.type !== "string" || !node.type) throw new Error("Tau Markdown 元素缺少类型");
      for (const child of node.children) visit(child, depth + 1);
    } else if (typeof node.text !== "string" || Object.hasOwn(node, "children"))
      throw new Error("Tau Markdown 文本节点无效");
  };
  for (const node of value) visit(node, 0);
}
export function parseObject(source: string): Record<string, unknown> {
  const value: unknown = JSON.parse(source);
  if (!isRecord(value)) throw new Error("Tau Markdown 属性头必须是 JSON 对象");
  jsonText(value);

  const keys: Array<Set<string> | null> = [];
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (char === "{") keys.push(new Set());
    else if (char === "[") keys.push(null);
    else if (char === "}" || char === "]") keys.pop();
    else if (char === '"') {
      const start = index++;
      while (index < source.length) {
        if (source[index] === "\\") index += 2;
        else if (source[index] === '"') break;
        else index++;
      }
      let next = index + 1;
      while (/\s/.test(source[next] ?? "") && next < source.length) next++;
      const current = keys.at(-1);
      if (current && source[next] === ":") {
        const key = JSON.parse(source.slice(start, index + 1)) as string;
        if (current.has(key)) throw new Error("Tau Markdown JSON 属性重复");
        current.add(key);
      }
    }
  }

  return value;
}
export function isTauMarkdown(source: string): boolean {
  const start = source.trimStart();
  return start.startsWith("<!-- tau-markdown:") || start.startsWith(":::tau ");
}
