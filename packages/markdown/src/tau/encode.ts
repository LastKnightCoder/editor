import type { FormattedText } from "../model.ts";
import {
  TAU_MARKDOWN_HEADER,
  assertContent,
  fenceFor,
  isRecord,
  isPlainTauInlineText,
  isWellFormed,
  jsonText,
  sameJson,
  setOwn,
  tauLimits,
  type TauMarkdownOptions,
} from "./format.ts";

export function encodeTauMarkdown(
  content: readonly unknown[],
  options: TauMarkdownOptions = {}
): string {
  const limits = tauLimits(options);
  assertContent(content, limits);
  const chunks: string[] = [];
  let length = 0;
  const append = (source: string) => {
    length += source.length;
    if (length > limits.maxChars) throw new Error("Tau Markdown 文本容量超限");
    chunks.push(source);
  };
  const frame = (kind: string, text: string, attributes?: Record<string, unknown>) => {
    const encoded = isWellFormed(text) ? text : JSON.stringify(text);
    const name = isWellFormed(text) ? kind : kind + "-json";
    const fence = fenceFor(encoded);
    append(fence + name + (attributes ? " " + jsonText(attributes) : "") + "\n");
    append(encoded);
    append("\n" + fence + "\n");
  };
  const inline = (nodes: readonly unknown[]): string | undefined => {
    const processor = options.processor;
    if (
      !processor ||
      !nodes.length ||
      nodes.some(
        node =>
          !isRecord(node) ||
          node.type !== "formatted" ||
          typeof node.text !== "string" ||
          !isWellFormed(node.text)
      )
    )
      return;
    const first = nodes[0];
    if (
      nodes.length === 1 &&
      isRecord(first) &&
      typeof first.text === "string" &&
      Object.entries(first).every(
        ([key, value]) => value === undefined || key === "type" || key === "text"
      ) &&
      isPlainTauInlineText(first.text)
    )
      return first.text;
    try {
      const leaves: FormattedText[] = nodes.filter(
        (node): node is FormattedText =>
          isRecord(node) && node.type === "formatted" && typeof node.text === "string"
      );
      const markdown = leaves.map(leaf => processor.leafToMarkdown(leaf)).join("");
      if (!markdown || markdown.includes(":tau-node[")) return;
      const parsed = processor.importFromMarkdown(markdown);
      const paragraph: unknown = parsed[0];
      if (
        parsed.length === 1 &&
        isRecord(paragraph) &&
        paragraph.type === "paragraph" &&
        sameJson(paragraph.children, nodes)
      )
        return markdown;
    } catch {
      // 不能证明无损的行内语法改用字面量载体。
    }
  };
  const visit = (value: unknown) => {
    if (!isRecord(value)) throw new Error("Tau Markdown 节点无效");
    if (!Array.isArray(value.children)) {
      const attributes = Object.fromEntries(
        Object.entries(value).filter(([key]) => key !== "text")
      );
      frame("tau-text", String(value.text), attributes);
      return;
    }
    const attributes: Record<string, unknown> = {};
    const fields: Array<[string, string]> = [];
    for (const [key, item] of Object.entries(value)) {
      if (key === "children" || item === undefined) continue;
      if (
        typeof item === "string" &&
        !["type", "collabId", "tauContract"].includes(key) &&
        (item.includes("\n") || item.length > 256)
      )
        fields.push([key, item]);
      else setOwn(attributes, key, item);
    }
    append(":::tau " + jsonText(attributes) + "\n");
    for (const [key, text] of fields) frame("tau-field", text, { key });
    for (let index = 0; index < value.children.length;) {
      const child: unknown = value.children[index];
      if (isRecord(child) && typeof child.text === "string" && !Array.isArray(child.children)) {
        let end = index + 1;
        while (end < value.children.length) {
          const next: unknown = value.children[end];
          if (!isRecord(next) || typeof next.text !== "string" || Array.isArray(next.children))
            break;
          end++;
        }
        const markdown = inline(value.children.slice(index, end));
        if (markdown !== undefined) frame("tau-inline", markdown);
        else for (let at = index; at < end; at++) visit(value.children[at]);
        index = end;
      } else {
        visit(child);
        index++;
      }
    }
    append(":::\n");
  };
  if (!options.fragment) {
    append(TAU_MARKDOWN_HEADER + "\n");
    if (options.metadata && Object.keys(options.metadata).length)
      frame("tau-meta", jsonText(options.metadata));
    append("\n");
  }
  content.forEach((node, index) => {
    if (index) append("\n");
    visit(node);
  });
  return chunks.join("");
}
