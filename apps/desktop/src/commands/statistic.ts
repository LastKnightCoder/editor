import { invoke } from "@/electron";
import { StatisticData } from "@/types";

export interface ICalendarHeatmapDataItem {
  time: string;
  /** 当天去重操作数（同 operation_id 只计一次），由主进程 SQL 聚合产出 */
  count: number;
}

export const getCalendarHeatmap = async (year: number): Promise<ICalendarHeatmapDataItem[]> => {
  return await invoke("get-operation-daily-counts", year);
};

export const getAllStatistic = async (): Promise<StatisticData[]> => {
  return await invoke("get-all-statistic");
};
