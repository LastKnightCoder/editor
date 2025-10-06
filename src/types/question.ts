import { Descendant } from "slate";

export interface IQuestion {
  id: number;
  createTime: number;
  updateTime: number;
  questionContent: string;
  answers: number[];
  groupId: number;
  sortIndex: number;
  resolvedTime?: number | null;
}

export interface IAnswer {
  createTime: number;
  updateTime: number;
  id: number;
  content: Descendant[];
}

export interface ICreateAnswer {
  contentId: number;
  content: Descendant[];
}
