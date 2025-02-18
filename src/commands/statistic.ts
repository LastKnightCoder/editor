import { invoke } from '@/electron';
import { Operation, StatisticData } from '@/types';

export interface ICalendarHeatmapDataItem {
  time: string;
  operation_list: Operation[];
}

export const getCalendarHeatmap = async (year: number): Promise<ICalendarHeatmapDataItem[]> => {
  return await invoke('get-operation-records-by-year', year);
}

export const getStatisticByDate = async (date: string): Promise<StatisticData[]> => {
  return await invoke('get-statistic-by-date', date);
}

export const getStatisticByType = async (type: string): Promise<StatisticData[]> => {
  return await invoke('get-statistic-by-type', type);
}

export const getStatisticByDateAndType = async (date: string, type: string): Promise<StatisticData[]> => {
  return await invoke('get-statistic-by-date-and-type', date, type);
}

export const getStatisticByDateRange = async (startDate: string, endDate: string): Promise<StatisticData[]> => {
  return await invoke('get-statistic-by-date-range', startDate, endDate);
}

export const getStatisticByDateRangeAndType = async (startDate: string, endDate: string, type: string): Promise<StatisticData[]> => {
  return await invoke('get-statistic-by-date-range-and-type', startDate, endDate, type);
}

export const getAllStatistic = async (): Promise<StatisticData[]> => {
  return await invoke('get-all-statistic');
}
