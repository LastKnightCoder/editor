import type { Editor, Element } from "slate";
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

export const isDeclaredElementEmpty = (editor: Editor | undefined, element: Element): boolean => {
  if (!editor) return false;
  try {
    return predicates.get(editor)?.get(element.type)?.(element) ?? false;
  } catch {
    // 判定失败时保留节点，避免错误触发删除。
    return false;
  }
};
