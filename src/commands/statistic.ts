import { invoke } from '@/electron';
import { Operation } from '@/types';

export interface ICalendarHeatmapDataItem {
  time: string;
  operation_list: Operation[];
}

export const getCalendarHeatmap = async (year: number): Promise<ICalendarHeatmapDataItem[]> => {
  return await invoke('get-operation-records-by-year', year);
}