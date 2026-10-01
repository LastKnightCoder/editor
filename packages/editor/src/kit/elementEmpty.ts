import { Element, Text, type Descendant, type Editor } from "slate";
import type { ElementSpec } from "../api/extension";

const predicates = new WeakMap<Editor, Map<string, NonNullable<ElementSpec["isEmpty"]>>>();

export const registerElementEmpty = (editor: Editor, elements: readonly ElementSpec[]) => {
  let byType = predicates.get(editor);
  if (!byType) {
    byType = new Map();
    predicates.set(editor, byType);
  }
  for (const spec of elements) {
    if (spec.isEmpty) byType.set(spec.type, spec.isEmpty);
    else byType.delete(spec.type);
  }
};

const evaluateEmpty = (
  editor: Editor | undefined,
  node: Descendant,
  active: Set<Descendant>
): boolean => {
  if (Text.isText(node)) return node.text === "";
  if (!Element.isElement(node) || active.has(node)) return false;
  active.add(node);
  try {
    const isEmpty = (child: Descendant) => evaluateEmpty(editor, child, active);
    const predicate = editor ? predicates.get(editor)?.get(node.type) : undefined;
    if (node.type === "paragraph") return node.children.every(isEmpty);
    const result: unknown = predicate?.(node, { isEmpty });
    if (result instanceof Promise) {
      void result.catch(() => undefined);
      return false;
    }
    return result === true;
  } catch {
    // 判定失败时保留节点，避免错误触发删除。
    return false;
  } finally {
    active.delete(node);
  }
};

export const isNodeEmpty = (node: Descendant, editor?: Editor): boolean =>
  evaluateEmpty(editor, node, new Set());

export const isDeclaredElementEmpty = (editor: Editor | undefined, element: Element): boolean =>
  isNodeEmpty(element, editor);
