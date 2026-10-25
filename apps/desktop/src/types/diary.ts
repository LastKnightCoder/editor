import type { ContentContractDictionary } from "@tau/db-schema/content-contracts";
import { Descendant } from "slate";

export type DiaryType = "daily" | "weekly" | "monthly";

export interface WeatherMood {
  type: "emoji" | "image";
  value: string;
}

// 产品设计：标签与具体 segment 绑定——一天可发多条日记（类朋友圈），
// 每条独立打标签。DiaryEntry.tags 是旧模型遗留的历史字段，仅作兼容保留，
// 展示与编辑标签一律用 segment.tags，不要改回 entry 级（会整天共享标签）。
export interface DiarySegment {
  id: number;
  diaryId: number;
  contentId: number;
  wordCount: number;
  createTime: number;
  updateTime: number;
  content: Descendant[];
  tags: string[];
}

export interface DiaryEntry {
  id: number;
  type: DiaryType;
  date: string; // YYYY-MM-DD for daily, YYYY-Www for weekly, YYYY-MM for monthly
  contentId: number | null; // Legacy, deprecated
  weather: WeatherMood | null;
  mood: WeatherMood | null;
  /** @deprecated 旧模型遗留：标签已迁到 segment 级，展示/编辑请用 segment.tags */
  tags: string[];
  wordCount: number;
  createTime: number;
  updateTime: number;
  segments: DiarySegment[];
  content: Descendant[]; // Concatenation of all segments (read-only convenience)
}

export type CreateDiaryEntry = Omit<
  DiaryEntry,
  "id" | "createTime" | "updateTime" | "wordCount" | "contentId" | "segments" | "content"
> & {
  content?: Descendant[];
  segments?: Descendant[][];
  contracts?: ContentContractDictionary;
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
