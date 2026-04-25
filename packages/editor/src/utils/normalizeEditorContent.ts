import type { Descendant } from "slate";

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

  return content as Descendant[];
};
