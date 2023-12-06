import { invoke } from '@tauri-apps/api';

interface IOperation {
  id: number;
  operation_time: number;
  operation_id: number;
  operation_content_type: string;
  operation_action: string;
}

export interface ICalendarHeatmapDataItem {
  time: string;
  operation_list: IOperation[];
}

export const getCalendarHeatmap = async (year: string): Promise<ICalendarHeatmapDataItem[]> => {
  return await invoke('get_operation_records_by_year', { year });
}