import { Descendant } from "slate";

export type DiaryType = "daily" | "weekly" | "monthly";

export interface WeatherMood {
  type: "emoji" | "image";
  value: string;
}

export interface DiaryEntry {
  id: number;
  type: DiaryType;
  date: string; // YYYY-MM-DD for daily, YYYY-Www for weekly, YYYY-MM for monthly
  contentId: number;
  weather: WeatherMood | null;
  mood: WeatherMood | null;
  wordCount: number;
  createTime: number;
  updateTime: number;
  content: Descendant[];
}

export type CreateDiaryEntry = Omit<
  DiaryEntry,
  "id" | "createTime" | "updateTime" | "wordCount" | "contentId"
>;

export type UpdateDiaryEntry = Partial<DiaryEntry> & { id: number };

export interface DiaryHeatmapData {
  date: string;
  wordCount: number;
}
