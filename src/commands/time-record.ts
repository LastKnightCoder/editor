import { invoke } from "@/electron";
import { ITimeRecord, TimeRecordGroup } from "@/types";

export const createTimeRecord = async (
  timeRecord: Omit<ITimeRecord, "id">,
): Promise<ITimeRecord> => {
  return invoke("create-time-record", timeRecord);
};

export const updateTimeRecord = async (
  timeRecord: ITimeRecord,
): Promise<ITimeRecord> => {
  return invoke("update-time-record", timeRecord);
};

export const deleteTimeRecord = async (id: number): Promise<number> => {
  return invoke("delete-time-record", id);
};

export const getAllTimeRecords = async (): Promise<TimeRecordGroup> => {
  return invoke("get-all-time-records");
};

export const getTimeRecordById = async (id: number): Promise<ITimeRecord> => {
  return invoke("get-time-record-by-id", id);
};

export const getTimeRecordsByDate = async (
  date: string,
): Promise<ITimeRecord[]> => {
  return invoke("get-time-records-by-date", date);
};

export const getTimeRecordsByDateRange = async (
  startDate: string,
  endDate: string,
): Promise<TimeRecordGroup> => {
  return invoke("get-time-records-by-date-range", startDate, endDate);
};

export const getAllEventTypes = async (): Promise<string[]> => {
  return invoke("get-all-event-types");
};

export const getAllTimeTypes = async (): Promise<string[]> => {
  return invoke("get-all-time-types");
};
