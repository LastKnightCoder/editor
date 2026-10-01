import type { FormattedText } from "./model.ts";
import type { LeafSerializationResult } from "./textCodec.ts";
import { UNKNOWN_NODE_DIRECTIVE } from "./unknownNode.ts";

export const UNKNOWN_TEXT_PREFIX = `:${UNKNOWN_NODE_DIRECTIVE}[`;
const INVISIBLE_CHARACTER = /\u200B|\u200C|\u200D|\uFEFF|\u2028|\u2029/;

/** 标签不包含物理换行；每个 UTF-16 边界保留自己的源码偏移。 */
export function encodeTextLabel(text: string): { label: string; offsets: number[] } {
  let label = "";
  const offsets = [0];
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    const code = text.charCodeAt(index);
    if (code < 32 || code === 127 || INVISIBLE_CHARACTER.test(char)) {
      const escaped =
        char === "\n"
          ? "n"
          : char === "\r"
            ? "r"
            : char === "\t"
              ? "t"
              : `u${code.toString(16).padStart(4, "0")}`;
      label += "\\\\" + escaped;
    } else {
      label += /[\\[\]*_`~<>!:{}&]/.test(char) ? "\\" + char : char;
    }
    offsets.push(label.length);
  }
  return { label, offsets };
}

const validateJson = (value: unknown, ancestors = new Set<object>(), inArray = false): void => {
  if (value === undefined && !inArray) return;
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (typeof value !== "object" || ancestors.has(value))
    throw new Error("[markdown] 文本保真载体需要无循环的 JSON 数据");
  if (!Array.isArray(value) && Object.prototype.toString.call(value) !== "[object Object]") {
    throw new Error("[markdown] 文本保真载体不接受非 JSON 对象");
  }
  ancestors.add(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) validateJson(value[index], ancestors, true);
  } else {
    for (const item of Object.values(value)) validateJson(item, ancestors);
  }
  ancestors.delete(value);
};

export function serializeUnknownText(leaf: Readonly<FormattedText>): LeafSerializationResult {
  if (
    leaf.type !== "formatted" ||
    typeof leaf.text !== "string" ||
    (leaf as { children?: unknown }).children !== undefined
  ) {
    throw new Error("[markdown] 文本保真载体必须是没有 children 的 formatted 叶子");
  }
  validateJson(leaf);
  const { label, offsets } = encodeTextLabel(leaf.text);
  // 先实体化反斜线，避免 Markdown 属性解析再次消耗 JSON 的转义。
  const json = JSON.stringify(leaf)
    .replace(
      new RegExp(INVISIBLE_CHARACTER.source, "g"),
      char => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`
    )
    .replace(/&/g, "&amp;")
    .replace(/\\/g, "&#92;")
    .replace(/"/g, "&quot;");
  const suffix = `]{type="formatted" json="${json}"}`;
  return {
    output: UNKNOWN_TEXT_PREFIX + label + suffix,
    prefixLength: UNKNOWN_TEXT_PREFIX.length,
    suffixLength: suffix.length,
    sourceOffsets: offsets.map(offset => UNKNOWN_TEXT_PREFIX.length + offset),
  };
}

/** codec 只读取独立冻结快照，失败前也不能改坏调用方文档。 */
export function snapshotText(leaf: Readonly<FormattedText>): Readonly<FormattedText> {
  validateJson(leaf);
  const snapshot = JSON.parse(JSON.stringify(leaf)) as FormattedText;
  const freeze = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  };
  freeze(snapshot);
  return snapshot;
}
