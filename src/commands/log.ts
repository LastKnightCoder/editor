import { invoke } from "@/electron";
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

export async function createLog(params: {
  periodType: EPeriodType;
  startDate: number;
  endDate: number;
  title?: string;
  tags?: string[];
  content?: Descendant[];
}): Promise<LogEntry> {
  return await invoke("create-log", params);
}

export async function updateLog(params: {
  id: number;
  title?: string;
  tags?: string[];
  content?: Descendant[];
}): Promise<LogEntry> {
  return await invoke("update-log", params);
}

export async function deleteLog(id: number): Promise<number> {
  return await invoke("delete-log", id);
}

export async function getLogById(id: number): Promise<LogEntry> {
  return await invoke("get-log-by-id", id);
}

export async function getLogsByPeriod(params: {
  periodType: EPeriodType;
  startDate: number;
  endDate: number;
}): Promise<LogEntry[]> {
  return await invoke("get-logs-by-period", params);
}

export async function getLogsByRange(params: {
  startDate: number;
  endDate: number;
  periodTypes?: EPeriodType[];
}): Promise<LogEntry[]> {
  return await invoke("get-logs-by-range", params);
}

export async function getAllLogs(): Promise<LogEntry[]> {
  return await invoke("get-all-logs");
}
