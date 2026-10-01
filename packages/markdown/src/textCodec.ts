import type { MarkdownImportNode } from "./codec.ts";
import type { FormattedText } from "./model.ts";
import { serializeUnknownText, snapshotText } from "./unknownText.ts";
import { UNKNOWN_NODE_DIRECTIVE } from "./unknownNode.ts";

export interface MarkdownTextRule {
  nodeType: string;
  directive?: string;
  content: "children" | "value";
  /** children 模式的源码包裹范围；指令沿用外层以保持既有位置口径。 */
  position?: "self" | "inherit";
  readMarks(node: MarkdownImportNode): Readonly<Record<string, unknown>> | null;
}

export interface MarkdownTextCodec {
  id: string;
  keys: readonly string[];
  importRules: readonly MarkdownTextRule[];
  exportWrap(leaf: Readonly<FormattedText>): { prefix: string; suffix: string } | null;
}

export interface LeafSerializationResult {
  output: string;
  prefixLength: number;
  suffixLength: number;
  /** 转义载体中每个原文本边界相对 output 的偏移。 */
  sourceOffsets?: readonly number[];
}

interface RegisteredRule {
  codec: MarkdownTextCodec;
  rule: MarkdownTextRule;
}

const keyOf = (type: string, directive?: string) => JSON.stringify([type, directive ?? null]);
const hasKey = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);

/** 处理器实例私有的纯标记注册表，不加载 UI 或默认格式。 */
export class MarkdownTextRegistry {
  private readonly rules = new Map<string, RegisteredRule>();
  private readonly keys = new Set<string>();
  private readonly codecs: readonly MarkdownTextCodec[];

  constructor(codecs: readonly MarkdownTextCodec[]) {
    this.codecs = codecs;
    const ids = new Set<string>();
    for (const codec of codecs) {
      if (!codec.id || ids.has(codec.id))
        throw new Error(`[markdown] 文本 codec id 缺失或重复：${codec.id}`);
      ids.add(codec.id);
      if (!codec.keys.length) throw new Error(`[markdown] 文本 codec ${codec.id} 未声明字段`);
      for (const key of codec.keys) {
        if (!key || key === "text" || key === "type" || key === "children" || this.keys.has(key)) {
          throw new Error(`[markdown] 文本字段无效、保留或重复：${key}`);
        }
        this.keys.add(key);
      }
      for (const rule of codec.importRules) {
        const key = keyOf(rule.nodeType, rule.directive);
        if (rule.directive === UNKNOWN_NODE_DIRECTIVE)
          throw new Error("[markdown] tau-node 是保真载体保留语法");
        if (!rule.nodeType || this.rules.has(key))
          throw new Error(`[markdown] 文本语法缺失或重复：${key}`);
        if (rule.content !== "children" && rule.content !== "value")
          throw new Error(`[markdown] 文本内容模式无效：${key}`);
        if (rule.position !== undefined && rule.position !== "self" && rule.position !== "inherit")
          throw new Error(`[markdown] 文本位置模式无效：${key}`);
        this.rules.set(key, { codec, rule });
      }
    }
  }

  claim(
    node: MarkdownImportNode
  ): { rule: MarkdownTextRule; marks: Readonly<Record<string, unknown>> } | null {
    const entry = this.rules.get(
      keyOf(node.type, typeof node.name === "string" ? node.name : undefined)
    );
    if (!entry) return null;
    const marks = entry.rule.readMarks(node);
    if (marks === null) return null;
    if (entry.rule.content === "children" && !Array.isArray(node.children)) {
      throw new Error(`[markdown] ${entry.codec.id} 认领的节点没有 children`);
    }
    if (
      !marks ||
      typeof marks !== "object" ||
      Array.isArray(marks) ||
      typeof marks.then === "function"
    ) {
      void Promise.resolve(marks).catch(() => undefined);
      throw new Error(`[markdown] ${entry.codec.id} 必须同步返回标记对象或 null`);
    }
    for (const key of Object.keys(marks)) {
      if (!entry.codec.keys.includes(key))
        throw new Error(`[markdown] ${entry.codec.id} 写入未拥有的字段：${key}`);
    }
    const snapshot = snapshotText({ ...marks, type: "formatted", text: "" });
    const safeMarks: Record<string, unknown> = Object.fromEntries(
      Object.entries(snapshot).filter(([key]) => key !== "type" && key !== "text")
    );
    return { rule: entry.rule, marks: Object.freeze(safeMarks) };
  }

  serialize(leaf: Readonly<FormattedText>): LeafSerializationResult {
    if (
      !leaf ||
      leaf.type !== "formatted" ||
      typeof leaf.text !== "string" ||
      (leaf as { children?: unknown }).children !== undefined
    ) {
      throw new Error("[markdown] 叶子编码需要 formatted 文本，不能带 children");
    }
    try {
      return this.serializeKnown(leaf);
    } catch {
      return serializeUnknownText(leaf);
    }
  }

  private serializeKnown(leaf: Readonly<FormattedText>): LeafSerializationResult {
    const data = leaf as unknown as Record<string, unknown>;
    const unknown = Object.keys(leaf).filter(
      key => key !== "text" && key !== "type" && data[key] !== undefined && !this.keys.has(key)
    );
    if (unknown.length) throw new Error(`[markdown] 文本字段缺少 codec：${unknown.join(", ")}`);
    let prefix = "";
    let suffix = "";
    let snapshot: Readonly<FormattedText> | undefined;
    for (const codec of this.codecs) {
      if (!codec.keys.some(key => hasKey(leaf, key) && data[key] !== undefined)) continue;
      snapshot ??= snapshotText(leaf);
      const wrap = codec.exportWrap(snapshot);
      if (wrap === null) continue;
      if (!wrap || typeof wrap.prefix !== "string" || typeof wrap.suffix !== "string") {
        void Promise.resolve(wrap).catch(() => undefined);
        throw new Error(`[markdown] ${codec.id} 必须同步返回 prefix/suffix 或 null`);
      }
      prefix = wrap.prefix + prefix;
      suffix += wrap.suffix;
    }
    return {
      output: prefix + leaf.text.replace(/\u200B/g, "") + suffix,
      prefixLength: prefix.length,
      suffixLength: suffix.length,
    };
  }
}
