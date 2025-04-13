import { Descendant } from "slate";

export interface IDocument {
  id: number;
  createTime: number;
  updateTime: number;
  title: string;
  desc: string;
  children: number[];
  content: Descendant[];
  isTop: boolean;
}

export interface IUpdateDocument {
  id: number;
  title: string;
  desc: string;
  children: number[];
  content: Descendant[];
  isTop: boolean;
}

export type ICreateDocument = Omit<IUpdateDocument, "id">;
export type IDeleteDocument = Pick<IDocument, "id">;

export interface IDocumentItem {
  id: number;
  createTime: number;
  updateTime: number;
  title: string;
  tags: string[];
  children: number[];
  isArticle: boolean;
  articleId: number;
  isCard: boolean;
  cardId: number;
  content: Descendant[];
  parents: number[];
  documents: number[];
  count: number;
  contentId: number;
}

export type ICreateDocumentItem = Omit<
  IDocumentItem,
  "id" | "createTime" | "updateTime" | "contentId" | "documents"
>;

export type IUpdateDocumentItem = Omit<
  IDocumentItem,
  "createTime" | "updateTime"
>;
export type IDeleteDocumentItem = Pick<IDocumentItem, "id">;
