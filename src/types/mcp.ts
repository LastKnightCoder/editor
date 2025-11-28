import type { OperationPeriod } from "@/utils/mcp-helpers";

/**
 * 详细操作结果
 */
export interface DetailedOperationResult {
  date: string;
  created: number[]; // 创建的内容 IDs
  edited: Array<{
    id: number;
    periods: OperationPeriod[];
  }>;
  deleted: number[]; // 删除的内容 IDs
}

/**
 * 带元数据的内容响应
 */
export interface ContentWithMetadata {
  id: number;
  markdown: string;
  truncated: boolean;
  originalLength: number;
  metadata: Record<string, unknown>;
}

/**
 * 日记响应（混合格式：元数据 JSON + 内容 Markdown）
 */
export interface DiaryResponse {
  id: number;
  type: "daily" | "weekly" | "monthly";
  date: string;
  weather: unknown;
  mood: unknown;
  wordCount: number;
  content: string; // Markdown
  createTime: string;
  updateTime: string;
}

/**
 * 日历事件响应（混合格式：元数据 JSON + 详细内容 Markdown）
 */
export interface CalendarEventResponse {
  id: number;
  title: string;
  calendarId: number;
  startDate: string;
  endDate: string | null;
  startTime: number | null;
  endTime: number | null;
  allDay: boolean;
  color: string | null;
  value: number | undefined;
  detailContent?: string; // Markdown
}
