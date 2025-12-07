import { Descendant } from "slate";

export interface IContent {
  id: number;
  createTime: number;
  updateTime: number;
  content: Descendant[];
  count: number;
  refCount: number;
}

export type ICreateContent = Omit<IContent, "id" | "createTime" | "updateTime">;
export type IUpdateContent = Omit<IContent, "updateTime">;
