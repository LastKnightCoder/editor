import type { Descendant } from "slate";
export const getContentLength = (content: Descendant[]) =>
  content.reduce((length, node) => length + getText(node).length, 0);
export function getText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  if ("text" in node && typeof node.text === "string") return node.text;
  if ("children" in node && Array.isArray(node.children))
    return node.children.map(getText).join("");
  return "";
}
