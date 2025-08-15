import { Descendant } from "slate";

export type EPeriodType = "day" | "week" | "month" | "year";

export interface LogEntry {
  id: number;
  create_time: number;
  update_time: number;
  period_type: EPeriodType;
  start_date: number;
  end_date: number;
  title: string;
  tags: string[];
  content_id: number;
  content: Descendant[];
}
