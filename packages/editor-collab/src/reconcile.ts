import * as Y from "yjs";
import diff from "fast-diff";
import { slateNodesToInsertDelta, yTextToSlateElement } from "@slate-yjs/core";
import { Element, Text, type Descendant } from "slate";

export interface ReconcileOptions {
  /** 外部格式的语义键；匹配时保留当前节点及未序列化的运行属性。 */
  matchKey?: (node: Descendant) => string;
  /** 宿主声明不在外部格式中保存的运行时属性，例如 Markdown 导入生成的 UUID。 */
  preserveAttributes?: (node: Element) => readonly string[];
}

type Entry = { node: Descendant; value: string | Y.XmlText; length: number };
const properties = (node: Descendant) =>
  Object.fromEntries(
    Object.entries(node).filter(
      ([key, value]) => key !== "text" && key !== "children" && value !== undefined
    )
  );
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  return JSON.stringify(value);
};

function fingerprint(node: Descendant, options: ReconcileOptions): string {
  if (options.matchKey) return options.matchKey(node);
  if (Text.isText(node)) return canonical({ ...node, type: "formatted" });
  const omit = new Set(options.preserveAttributes?.(node) ?? []);
  return canonical({
    ...Object.fromEntries(Object.entries(properties(node)).filter(([key]) => !omit.has(key))),
    children: node.children.map(child => fingerprint(child, options)),
  });
}

/** 文本差分保留未改变字符的 CRDT 身份。 */
export function replaceYText(text: Y.Text, value: string) {
  let offset = 0;
  for (const [operation, part] of diff(text.toString(), value)) {
    if (operation === -1) text.delete(offset, part.length);
    else if (operation === 1) {
      text.insert(offset, part);
      offset += part.length;
    } else offset += part.length;
  }
}

function normalized(nodes: readonly Descendant[]): Descendant[] {
  const result: Descendant[] = [];
  for (const node of nodes) {
    if (Text.isText(node)) {
      if (!node.text) {
        if (Object.keys(properties(node)).some(key => key !== "type"))
          throw new Error("空文本包含 Yjs 无法无损保存的属性，请保留原文件并调整该节点");
        continue;
      }
      const previous = result[result.length - 1];
      if (
        previous &&
        Text.isText(previous) &&
        canonical(properties(previous)) === canonical(properties(node))
      ) {
        result[result.length - 1] = { ...previous, text: previous.text + node.text };
      } else result.push(node);
    } else {
      normalized(node.children);
      result.push(node);
    }
  }
  return result;
}

export function reconcileYContent(
  root: Y.XmlText,
  input: readonly Descendant[],
  options: ReconcileOptions = {}
) {
  const next = normalized(input);
  const previous: Entry[] = root
    .toDelta()
    .map((part: { insert: unknown; attributes?: Record<string, unknown> }) => {
      if (typeof part.insert === "string")
        return {
          node: { ...part.attributes, type: "formatted", text: part.insert } as Descendant,
          value: part.insert,
          length: part.insert.length,
        };
      if (!(part.insert instanceof Y.XmlText)) throw new Error("正文包含不支持的 Yjs 嵌入值");
      return { node: yTextToSlateElement(part.insert), value: part.insert, length: 1 };
    });
  const keys = new Map<string, string>();
  const token = (node: Descendant) => {
    const key = fingerprint(node, options);
    const existing = keys.get(key);
    if (existing !== undefined) return existing;
    const value = String.fromCharCode(keys.size + 1);
    keys.set(key, value);
    return value;
  };
  const oldKeys = previous.map(entry => token(entry.node)).join("");
  const newKeys = next.map(token).join("");
  // 超大兄弟列表退回按位置对账，避免 token 编码溢出；不会整树删除。
  const changes =
    keys.size < 0xd800
      ? diff(oldKeys, newKeys)
      : ([
          [-1, oldKeys],
          [1, newKeys],
        ] as const);
  let oldIndex = 0,
    nextIndex = 0,
    offset = 0;
  let removed: Entry[] = [],
    inserted: Descendant[] = [];
  const add = (nodes: Descendant[]) => {
    if (!nodes.length) return;
    root.applyDelta([{ retain: offset }, ...slateNodesToInsertDelta(nodes)]);
    offset += nodes.reduce(
      (length, node) => length + (Text.isText(node) ? node.text.length : 1),
      0
    );
  };
  const flush = () => {
    const length = Math.min(removed.length, inserted.length);
    for (let index = 0; index < length; index++) {
      const old = removed[index],
        node = inserted[index];
      if (
        old.value instanceof Y.XmlText &&
        Element.isElement(node) &&
        old.node.type === node.type
      ) {
        const attrs = properties(node);
        const preserve = new Set(options.preserveAttributes?.(node) ?? []);
        for (const key of Object.keys(old.value.getAttributes()))
          if (!(key in attrs) && !preserve.has(key)) old.value.removeAttribute(key);
        for (const [key, value] of Object.entries(attrs))
          if (
            (!preserve.has(key) || old.value.getAttribute(key) === undefined) &&
            canonical(old.value.getAttribute(key)) !== canonical(value)
          )
            old.value.setAttribute(key, value);
        reconcileYContent(old.value, node.children, options);
        offset++;
      } else if (typeof old.value === "string" && Text.isText(node)) {
        let cursor = offset;
        for (const [operation, text] of diff(old.value, node.text)) {
          if (operation === -1) root.delete(cursor, text.length);
          else if (operation === 1) {
            root.insert(cursor, text, properties(node));
            cursor += text.length;
          } else cursor += text.length;
        }
        const attrs = properties(node);
        const patch = {
          ...Object.fromEntries(
            Object.keys(properties(old.node))
              .filter(key => !(key in attrs))
              .map(key => [key, null])
          ),
          ...attrs,
        };
        if (canonical(properties(old.node)) !== canonical(attrs))
          root.format(offset, node.text.length, patch);
        offset += node.text.length;
      } else {
        root.delete(offset, old.length);
        add([node]);
      }
    }
    for (const old of removed.slice(length)) root.delete(offset, old.length);
    add(inserted.slice(length));
    removed = [];
    inserted = [];
  };
  for (const [operation, text] of changes) {
    if (operation === -1) {
      removed.push(...previous.slice(oldIndex, oldIndex + text.length));
      oldIndex += text.length;
    } else if (operation === 1) {
      inserted.push(...next.slice(nextIndex, nextIndex + text.length));
      nextIndex += text.length;
    } else {
      flush();
      for (const entry of previous.slice(oldIndex, oldIndex + text.length)) offset += entry.length;
      oldIndex += text.length;
      nextIndex += text.length;
    }
  }
  flush();
}
