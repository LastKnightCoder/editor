import { Descendant } from "slate";

export const DEFAULT_ARTICLE_CONTENT: Descendant[] = [
  {
    type: "paragraph",
    children: [{ type: "formatted", text: "" }],
  },
];
