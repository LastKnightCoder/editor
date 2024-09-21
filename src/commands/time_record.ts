import { invoke } from "@tauri-apps/api";
import { ITimeRecord, TimeRecordGroup } from "@/types";

export const createTimeRecord = async (timeRecord: Omit<ITimeRecord, 'id'>): Promise<ITimeRecord> => {
  return invoke('plugin:time_record|create_time_record', {
    ...timeRecord,
    content: JSON.stringify(timeRecord.content),
  });
}

export const updateTimeRecord = async (timeRecord: ITimeRecord): Promise<ITimeRecord> => {
  return invoke('plugin:time_record|update_time_record', {
    ...timeRecord,
    content: JSON.stringify(timeRecord.content),
  });
}

export const deleteTimeRecord = async (id: number): Promise<number> => {
  return invoke('plugin:time_record|delete_time_record', {
    id
  });
}

const transformTimeRecord = (item: any): ITimeRecord => {
  const res =  {
    ...item,
    content: JSON.parse(item.content),
    eventType: item.event_type,
    timeType: item.time_type,
  }
  delete res.event_type;
  delete res.time_type;
  return res;
}

export const getAllTimeRecords = async (): Promise<TimeRecordGroup> => {
  const list: any[] = await invoke('plugin:time_record|get_all_time_records');
  return list.map((item) => {
    return {
      date: item.date,
      timeRecords: item.time_records.map(transformTimeRecord),
    };
  });
}

export const getTimeRecordById = async (id: number): Promise<ITimeRecord> => {
  const item: any = await invoke('plugin:time_record|get_time_record_by_id', {
    id
  });
  return transformTimeRecord(item);
}

export const getTimeRecordsByDate = async (date: string): Promise<ITimeRecord[]> => {
  const list: any[] = await invoke('plugin:time_record|get_time_records_by_date', {
    date
  });
  return list.map(transformTimeRecord);
}

export const getTimeRecordsByDateRange = async (startDate: string, endDate: string): Promise<TimeRecordGroup> => {
  const list: any[] = await invoke('plugin:time_record|get_time_records_by_date_range', {
    startDate,
    endDate,
  });
  return list.map((item) => {
    return {
      date: item.date,
      timeRecords: item.time_records.map(transformTimeRecord),
    };
  });
}

export const getAllEventTypes = async (): Promise<string[]> => {
  return invoke('plugin:time_record|get_all_event_types');
}

export const getAllTimeTypes = async (): Promise<string[]> => {
  return invoke('plugin:time_record|get_all_time_types');
}
