import { Node, type Editor } from "slate";
import { ReactEditor } from "slate-react";

export interface OutlineHeading {
  level: number;
  title: string;
}

const inlineText = (value: unknown, editor: Editor): string => {
  if (!value || typeof value !== "object") return "";
  const node = value as { type?: string; text?: string; tex?: string; alt?: string };
  if (typeof node.text === "string") return node.text;
  if (node.type === "inline-math") return node.tex ?? "";
  if (node.type === "inline-image") return node.alt ?? "[图片]";
  try {
    return ReactEditor.toDOMNode(editor, value as Node).textContent ?? "";
  } catch {
    return Node.string(value as Node);
  }
};

/** 正文顶层标题，顺序与页面上的标题一致。 */
export function outlineOf(editor: Editor, nodes: readonly unknown[]): OutlineHeading[] {
  return nodes.flatMap(node => {
    const value = node as { type?: string; level?: number; children?: unknown[] };
    if (value?.type !== "header" || !Array.isArray(value.children)) return [];
    return [
      {
        level: value.level ?? 1,
        title: value.children.map(child => inlineText(child, editor)).join(""),
      },
    ];
  });
}
