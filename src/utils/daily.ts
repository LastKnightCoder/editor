import dayjs from "dayjs";
import weekOfYear from "dayjs/plugin/weekOfYear";
dayjs.extend(weekOfYear);

import { DailyNote } from "@/types/daily_note";

interface DailyNoteWithYear {
  year: number;
  dailyNotes: DailyNote[];
}

export const getDailyNoteWithYear = (dailyNotes: DailyNote[]) => {
  const years: DailyNoteWithYear[] = [];

  dailyNotes.forEach((dailyNote) => {
    const date = new Date(dailyNote.date);
    const year = date.getFullYear();
    const yearIndex = years.findIndex((item) => item.year === year);

    if (yearIndex === -1) {
      years.push({ year, dailyNotes: [dailyNote] });
    } else {
      years[yearIndex].dailyNotes.push(dailyNote);
    }
  });

  return years;
}

export const filterDailyNoteByYear = (dailyNotes: DailyNote[], year: string) => {
  // 根据年份筛选日记
  return dailyNotes.filter((dailyNote) => {
    return new Date(dailyNote.date).getFullYear().toString() === year;
  })
}

export const filterDailyNoteByQuarter = (dailyNotes: DailyNote[], year: string, quarter: string) => {
  // 根据季度筛选日记
  return dailyNotes.filter((dailyNote) => {
    const date = new Date(dailyNote.date);
    const dailyNoteYear = date.getFullYear().toString();
    const dailyNoteQuarter = Math.floor((date.getMonth() + 3) / 3).toString();
    return dailyNoteYear === year && dailyNoteQuarter === quarter;
  })
}

export const filterDailyNoteByMonth = (dailyNotes: DailyNote[], year: string, month: string) => {
  // 根据月份筛选日记
  return dailyNotes.filter((dailyNote) => {
    const date = new Date(dailyNote.date);
    const dailyNoteYear = date.getFullYear().toString();
    const dailyNoteMonth = (date.getMonth() + 1).toString();
    return dailyNoteYear === year && dailyNoteMonth === month;
  })
}

export const filterDailyNoteByWeek = (dailyNotes: DailyNote[], year: string, week: string) => {
  // 根据周筛选日记，从周一开始计算
  return dailyNotes.filter((dailyNote) => {
    const date = new Date(dailyNote.date);
    const dailyNoteYear = date.getFullYear().toString();
    const dailyNoteWeek = dayjs(date).week().toString();
    return dailyNoteYear === year && dailyNoteWeek === week;
  })
}

export const filterDailyNoteByDate = (dailyNotes: DailyNote[], date: string) => {
  // 根据日筛选日记
  return dailyNotes.filter((dailyNote) => {
    return dailyNote.date === date;
  })
}


export const filterDailyNoteByRange = (dailyNotes: DailyNote[], start: string, end: string) => {
  // start 和 end 的格式为 'YYYY-MM-DD'
  return dailyNotes.filter((dailyNote) => {
    const date = new Date(dailyNote.date);
    return date >= new Date(start) && date <= new Date(end);
  })
}