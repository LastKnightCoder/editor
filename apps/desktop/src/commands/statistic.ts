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

export const getStatisticByDate = async (date: string): Promise<StatisticData | undefined> => {
  return await invoke("get-statistic-by-date", date);
};

export const getStatisticByType = async (type: string): Promise<StatisticData | undefined> => {
  return await invoke("get-statistic-by-type", type);
};

export const getStatisticByDateAndType = async (
  date: string,
  type: string
): Promise<StatisticData | undefined> => {
  return await invoke("get-statistic-by-date-and-type", date, type);
};

export const getStatisticByDateRange = async (
  startDate: string,
  endDate: string
): Promise<StatisticData[]> => {
  return await invoke("get-statistic-by-date-range", startDate, endDate);
};

export const getStatisticByDateRangeAndType = async (
  startDate: string,
  endDate: string,
  type: string
): Promise<StatisticData[]> => {
  return await invoke("get-statistic-by-date-range-and-type", startDate, endDate, type);
};

export const getAllStatistic = async (): Promise<StatisticData[]> => {
  return await invoke("get-all-statistic");
};
