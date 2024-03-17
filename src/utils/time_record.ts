import dayjs from "dayjs";
import weekOfYear from "dayjs/plugin/weekOfYear";
import { TimeRecordGroup } from '@/types/time_record';

dayjs.extend(weekOfYear);

export const filterTimeRecordsByYear = (timeRecords: TimeRecordGroup, year: string): TimeRecordGroup => {
  return timeRecords.filter((timeRecord) => {
    return new Date(timeRecord.date).getFullYear() === Number(year);
  });
}

export const filterTimeRecordsByQuarter = (timeRecords: TimeRecordGroup, year: string, quarter: string): TimeRecordGroup => {
  return timeRecords.filter((timeRecord) => {
    const date = new Date(timeRecord.date);
    const dateMonth = date.getMonth();
    const dateYear = date.getFullYear();
    return dateYear === Number(year) && Math.floor(dateMonth / 3) + 1 === Number(quarter);
  });
}

export const filterTimeRecordsByMonth = (timeRecords: TimeRecordGroup, year: string, month: string): TimeRecordGroup => {
  return timeRecords.filter((timeRecord) => {
    const date = new Date(timeRecord.date);
    const dateMonth = date.getMonth();
    const dateYear = date.getFullYear();
    return (dateMonth + 1).toString() === month && dateYear === Number(year);
  });
}

export const filterTimeRecordsByWeek = (timeRecords: TimeRecordGroup, year: string, week: string): TimeRecordGroup => {
  return timeRecords.filter((timeRecord) => {
    const date = new Date(timeRecord.date);
    const dateWeek = dayjs(date).week();
    const dateYear = date.getFullYear();
    return dateWeek === Number(week) && dateYear === Number(year);
  });
}

export const filterTimeRecordsByDate = (timeRecords: TimeRecordGroup, date: string): TimeRecordGroup => {
  return timeRecords.filter((timeRecord) => {
    return timeRecord.date === date;
  });
}

export const filterTimeRecordsByDateRange = (timeRecords: TimeRecordGroup, startDate: string, endDate: string): TimeRecordGroup => {
  return timeRecords.filter((timeRecord) => {
    return timeRecord.date >= startDate && timeRecord.date <= endDate;
  });
}