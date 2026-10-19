import { Element, type Node } from "slate";
import type { ParagraphElement } from "../types/element/paragraph.ts";

export type { ParagraphElement } from "../types/element/paragraph.ts";

export const createParagraph = (): ParagraphElement => ({
  type: "paragraph",
  children: [{ type: "formatted", text: "" }],
});

export const isParagraphElement = (node: Node): node is ParagraphElement =>
  Element.isElement(node) && node.type === "paragraph";
