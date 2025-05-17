import { Descendant } from "slate";

export interface IJournal {
  id: number;
  type: "daily" | "weekly" | "monthly" | "yearly";
  startTime: number;
  endTime: number;
  content: Descendant[];
  count: number;
  contentId: number;
}

export interface ICreateJournal {
  type: "daily" | "weekly" | "monthly" | "yearly";
  startTime: number;
  endTime: number;
  content?: Descendant[];
  count?: number;
}

export interface IUpdateJournal {
  id: number;
  type: "daily" | "weekly" | "monthly" | "yearly";
  startTime: number;
  endTime: number;
}
