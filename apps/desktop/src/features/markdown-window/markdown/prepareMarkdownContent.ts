import type { EditorKit } from "@tau/editor";
import { Element, Text, type Descendant, type Editor } from "slate";

/** 在 Yjs 转回 Slate 后补齐行内落点，避免逐个插入引发全文脏路径变换。 */
export function createMarkdownContentPreparer(kit: EditorKit) {
  const elements = new Map(
    kit.extensions.flatMap(extension =>
      (extension.elements ?? []).map(spec => [spec.type, spec] as const)
    )
  );
  return (content: Descendant[], editor?: Editor): Descendant[] => {
    const isInline = (node: Descendant | undefined) =>
      Element.isElement(node) &&
      elements.has(node.type) &&
      (editor ? editor.isInline(node) : elements.get(node.type)?.kind === "inline");
    const emptyText = (): Descendant => ({ type: "formatted", text: "" });
    const prepare = (node: Descendant): Descendant => {
      if (!Element.isElement(node)) return node;
      const spec = elements.get(node.type);
      if (!spec || (editor ? editor.isVoid(node) : spec.isVoid)) return node;
      let children = node.children.map(prepare);
      if (children.length && children.every(child => Text.isText(child) || isInline(child))) {
        const padded: Descendant[] = [];
        for (const child of children) {
          if (isInline(child) && !Text.isText(padded.at(-1))) padded.push(emptyText());
          padded.push(child);
        }
        if (isInline(padded.at(-1))) padded.push(emptyText());
        children = padded;
      }
      return children.length === node.children.length &&
        children.every((child, index) => child === node.children[index])
        ? node
        : ({ ...node, children } as Descendant);
    };
    return content.map(prepare);
  };
}
