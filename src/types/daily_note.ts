import { Descendant } from "slate";

export interface DailyNote {
  id: number;
  content: Descendant[];
  date: string;
  contentId: number;
}
