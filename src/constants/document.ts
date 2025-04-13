import { ICreateDocument, ICreateDocumentItem } from "@/types";

export const DEFAULT_CREATE_DOCUMENT: ICreateDocument = {
  title: "",
  desc: "",
  children: [],
  content: [],
  isTop: false,
};

export const DEFAULT_CREATE_DOCUMENT_ITEM: ICreateDocumentItem = {
  title: "无标题文档",
  children: [],
  tags: [],
  isArticle: false,
  articleId: 0,
  isCard: false,
  cardId: 0,
  content: [
    {
      type: "paragraph",
      children: [{ type: "formatted", text: "" }],
    },
  ],
  parents: [],
  count: 0,
};
