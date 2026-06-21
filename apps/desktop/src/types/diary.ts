import { Descendant } from "slate";

export type DiaryType = "daily" | "weekly" | "monthly";

export interface WeatherMood {
  type: "emoji" | "image";
  value: string;
}

export interface DiarySegment {
  id: number;
  diaryId: number;
  contentId: number;
  wordCount: number;
  createTime: number;
  updateTime: number;
  content: Descendant[];
}

export interface DiaryEntry {
  id: number;
  type: DiaryType;
  date: string; // YYYY-MM-DD for daily, YYYY-Www for weekly, YYYY-MM for monthly
  contentId: number | null; // Legacy, deprecated
  weather: WeatherMood | null;
  mood: WeatherMood | null;
  tags: string[]; // 自定义标签，如 ["日常","反思","周记"]
  wordCount: number;
  createTime: number;
  updateTime: number;
  segments: DiarySegment[];
  content: Descendant[]; // Concatenation of all segments (read-only convenience)
}

export type CreateDiaryEntry = Omit<
  DiaryEntry,
  | "id"
  | "createTime"
  | "updateTime"
  | "wordCount"
  | "contentId"
  | "segments"
  | "content"
> & {
  content?: Descendant[];
  segments?: Descendant[][];
};

export type UpdateDiaryEntry = Partial<
  Pick<DiaryEntry, "weather" | "mood" | "content" | "tags">
> & { id: number };

// 朋友圈流用的扁平 segment 项：一个 segment + 父 entry 摘要
export interface DiarySegmentItem {
  id: number;
  diaryId: number;
  contentId: number;
  wordCount: number;
  createTime: number;
  updateTime: number;
  content: Descendant[];
  entryDate: string;
  entryDateMs: number;
  weather: WeatherMood | null;
  mood: WeatherMood | null;
  tags: string[];
}

// 标签设置（颜色、排序等）
export interface DiaryTagSetting {
  name: string;
  color: string;
  sort: number;
  createTime: number;
  updateTime: number;
}

export interface DiaryHeatmapData {
  date: string;
  wordCount: number;
}
