import type { Descendant } from "slate";

export const DEFAULT_DIARY_CONTENT: Descendant[] = [
  {
    type: "paragraph",
    disableDrag: false,
    children: [{ type: "formatted", text: "" }],
  },
];

export const hasDiaryContent = (
  content?: Descendant[] | null,
): content is Descendant[] => Array.isArray(content) && content.length > 0;

export const createEmptyDiaryContent = (): Descendant[] =>
  JSON.parse(JSON.stringify(DEFAULT_DIARY_CONTENT));
