import { Descendant } from "slate";

export const CREATE_ARTICLE_ID = -1;

export const DEFAULT_ARTICLE_CONTENT: Descendant[] = [
  {
    type: "paragraph",
    children: [{ type: "formatted", text: "" }],
  },
];
