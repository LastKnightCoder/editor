import { Dayjs } from "dayjs";
import { EGoalItemType } from "@/types";

// 表单值类型定义
export interface IGoalFormValues {
  title: string;
  description?: string;
  dateRange?: [Dayjs, Dayjs];
}

export interface ICreateItemFormValues {
  title: string;
  description?: string;
  type: EGoalItemType;
  target_value?: number;
  unit?: string;
}

export interface IProgressFormValues {
  title: string;
  description?: string;
  progress_delta?: number;
}

export interface IEditProgressFormValues {
  current_value: number;
}
