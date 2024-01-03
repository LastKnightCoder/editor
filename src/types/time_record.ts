import { Descendant } from "slate";

export interface ITimeRecord {
  id: number;
  date: string;
  cost: number;
  content: Descendant[],
  eventType: string;
  timeType: string;
}

export type TimeRecordGroup = Array<{
  date: string;
  timeRecords: ITimeRecord[];
}>