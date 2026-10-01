import { Editor, Element, Node, Path, Point, Range, type Descendant } from "slate";
import type { RegisteredCopy } from "../api/copy";
import type { ExtensionCircuitBreaker } from "../kit/extensionGuard";

interface CopyTrace {
  node: Descendant;
  policy?: RegisteredCopy;
  children?: CopyTrace[];
  fullySelected: boolean;
  ancestorTypes: readonly string[];
}

const ABORT_COPY = Symbol("abort-copy");

const sameData = (left: unknown, right: unknown, seen = new WeakMap<object, object>()): boolean => {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  if (Array.isArray(left) && Array.isArray(right) && left.length !== right.length) return false;
  if (Object.getPrototypeOf(left) !== Object.getPrototypeOf(right)) return false;
  if (!Array.isArray(left) && Object.prototype.toString.call(left) !== "[object Object]")
    return false;
  if (seen.has(left)) return seen.get(left) === right;
  seen.set(left, right);
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  return keys.every(
    key =>
      Object.prototype.hasOwnProperty.call(right, key) &&
      sameData(
        (left as Record<string, unknown>)[key],
        (right as Record<string, unknown>)[key],
        seen
      )
  );
};

const freezeDeep = <T>(value: T, seen = new WeakSet<object>()): T => {
  if (value && typeof value === "object" && !seen.has(value)) {
    // 文档片段只处理数据对象；Date/Map 等可变内置对象无法靠 freeze 保护。
    if (!Array.isArray(value) && Object.prototype.toString.call(value) !== "[object Object]") {
      throw ABORT_COPY;
    }
    seen.add(value);
    for (const child of Object.values(value)) freezeDeep(child, seen);
    Object.freeze(value);
  }
  return value;
};

export const normalizeCopiedFragment = (
  editor: Editor,
  fragment: Descendant[],
  policies: ReadonlyMap<string, RegisteredCopy>,
  breaker: ExtensionCircuitBreaker,
  selection = editor.selection
): Descendant[] => {
  if (!selection || Range.isCollapsed(selection) || !fragment.length || !policies.size) {
    return fragment;
  }
  if (!fragment.some(node => Element.isElement(node) && policies.has(node.type))) return fragment;

  try {
    // 上游插件可能改写 getFragment；不能将同类型、同数量误当成原节点对应关系。
    if (!sameData(fragment, Node.fragment(editor, selection))) return fragment;
    const snapshot = structuredClone(fragment);
    const frozen = new WeakSet<object>();
    freezeDeep(snapshot, frozen);
    const [start, end] = Range.edges(selection);

    const traceChildren = (
      original: readonly Descendant[],
      copied: readonly Descendant[],
      parentPath: Path,
      ancestorTypes: readonly string[]
    ): CopyTrace[] => {
      const selected = original.flatMap((node, index) => {
        const path = [...parentPath, index];
        return Range.includes(selection, path) ? [{ node, path }] : [];
      });
      if (selected.length !== copied.length) throw ABORT_COPY;
      return copied.map((node, index) => {
        const entry = selected[index];
        if (
          Element.isElement(node) !== Element.isElement(entry.node) ||
          node.type !== entry.node.type
        )
          throw ABORT_COPY;
        const policy =
          Element.isElement(node) &&
          Editor.isBlock(editor, entry.node as Element) &&
          !editor.isVoid(entry.node as Element)
            ? policies.get(node.type)
            : undefined;
        const trace: CopyTrace = { node, policy, fullySelected: false, ancestorTypes };
        // 未声明策略的节点是保留边界，不进入未知领域的内部结构。
        if (!policy || !Element.isElement(node) || !Element.isElement(entry.node)) return trace;
        const [nodeStart, nodeEnd] = Range.edges(Editor.range(editor, entry.path));
        trace.fullySelected =
          Point.compare(start, nodeStart) <= 0 && Point.compare(end, nodeEnd) >= 0;
        trace.children = traceChildren(
          entry.node.children,
          node.children,
          entry.path,
          Object.freeze([...ancestorTypes, entry.node.type])
        );
        return trace;
      });
    };

    // 一次性建好 trace，之后的解包不再影响原路径和祖先信息。
    const traces = traceChildren(editor.children, snapshot, [], Object.freeze([]));
    const apply = (trace: CopyTrace): Descendant[] => {
      if (!trace.policy || !trace.children || !Element.isElement(trace.node)) return [trace.node];
      const { owner, copy } = trace.policy;
      if (breaker.isDisabled(owner)) throw ABORT_COPY;
      const children = trace.children.flatMap(apply);
      const element = freezeDeep({ ...trace.node, children }, frozen);
      try {
        const decision: unknown = copy(
          Object.freeze({
            element,
            fullySelected: trace.fullySelected,
            ancestorTypes: trace.ancestorTypes,
          })
        );
        if (decision === "keep") return [element as unknown as Descendant];
        if (decision === "unwrap") return children;
        // 错误声明的异步回调也必须吸收拒绝，避免复制之外产生未处理异常。
        void Promise.resolve(decision).catch(() => undefined);
        throw new Error("复制策略必须同步返回 keep 或 unwrap");
      } catch (error) {
        breaker.record(owner, "copy", error);
        throw ABORT_COPY;
      }
    };
    // 冻结只约束策略输入，调用方仍获得普通可编辑的独立片段。
    return structuredClone(traces.flatMap(apply));
  } catch {
    // 任一策略或对应关系失效时整体回退，不留下半次解包结果。
    return fragment;
  }
};

export const withNormalizedCopy = (
  editor: Editor,
  policies: ReadonlyMap<string, RegisteredCopy>,
  breaker: ExtensionCircuitBreaker
): Editor => {
  if (!policies.size) return editor;
  const { getFragment } = editor;
  editor.getFragment = () => {
    const content = editor.children;
    const selection = editor.selection ? structuredClone(editor.selection) : null;
    const operationCount = editor.operations.length;
    const fragment = getFragment();
    if (
      editor.children !== content ||
      editor.operations.length !== operationCount ||
      !sameData(editor.selection, selection)
    )
      return fragment;
    return normalizeCopiedFragment(editor, fragment, policies, breaker, selection);
  };
  return editor;
};
