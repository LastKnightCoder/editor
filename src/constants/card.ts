import { Descendant } from "slate";
import { ECardCategory } from "@/types";

export const DEFAULT_CARD_CONTENT: Descendant[] = [
  {
    type: "paragraph",
    children: [{ type: "formatted", text: "" }],
  },
];

export const cardCategoryName = {
  [ECardCategory.Temporary]: "闪念笔记",
  [ECardCategory.Permanent]: "永久笔记",
  [ECardCategory.Theme]: "主题笔记",
} as const;
