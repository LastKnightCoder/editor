import type { Descendant } from "slate";
import { createParagraph } from "../model/paragraph";

export const normalizeEditorContent = (content: unknown): Descendant[] => {
  if (!Array.isArray(content) || content.length === 0) {
    return [createParagraph()];
  }

  return content as Descendant[];
};
