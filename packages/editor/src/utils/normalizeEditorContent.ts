import type { Descendant } from "slate";
import { stripRetiredEditorBlocks } from "@tau/collaboration";

const createEmptyEditorContent = (): Descendant[] => [
  {
    type: "paragraph",
    children: [{ type: "formatted", text: "" }],
  } as Descendant,
];

export const normalizeEditorContent = (content: unknown): Descendant[] => {
  if (!Array.isArray(content) || content.length === 0) {
    return createEmptyEditorContent();
  }

  return stripRetiredEditorBlocks(content).value as Descendant[];
};
