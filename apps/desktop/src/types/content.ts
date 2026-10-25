import { Descendant } from "slate";
import type { ContentContractDictionary } from "@tau/db-schema/content-contracts";

export interface IContent {
  id: number;
  createTime: number;
  updateTime: number;
  content: Descendant[];
  count: number;
  refCount: number;
  revision?: string;
  contracts?: ContentContractDictionary;
}

export type ICreateContent = Omit<IContent, "id" | "createTime" | "updateTime">;
export type IUpdateContent = Omit<IContent, "updateTime">;
