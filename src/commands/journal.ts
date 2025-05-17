import { invoke } from "@/electron";
import { Descendant } from "slate";
import { IJournal, ICreateJournal, IUpdateJournal } from "@/types";
import dayjs from "dayjs";
import weekOfYear from "dayjs/plugin/weekOfYear";
import localeData from "dayjs/plugin/localeData";
import isoWeek from "dayjs/plugin/isoWeek";
import "dayjs/locale/zh-cn";

// 初始化 dayjs 插件
dayjs.extend(weekOfYear);
dayjs.extend(localeData);
dayjs.extend(isoWeek);
dayjs.locale("zh-cn"); // 使用中文区域设置，周一作为一周的第一天

const defaultContent: Descendant[] = [
  {
    type: "paragraph",
    children: [{ type: "formatted", text: "" }],
  },
];

// 创建日志
export const createJournal = async (
  data: ICreateJournal,
): Promise<IJournal> => {
  return await invoke("journal:create", data);
};

// 更新日志
export const updateJournal = async (
  data: IUpdateJournal,
): Promise<IJournal | null> => {
  return await invoke("journal:update", data);
};

// 删除日志
export const deleteJournal = async (journalId: number): Promise<number> => {
  return await invoke("journal:delete", journalId);
};

// 获取指定ID的日志
export const getJournalById = async (
  journalId: number,
): Promise<IJournal | null> => {
  return await invoke("journal:get-by-id", journalId);
};

// 获取指定类型的所有日志
export const getJournalsByType = async (type: string): Promise<IJournal[]> => {
  return await invoke("journal:get-by-type", type);
};

// 获取所有日志
export const getAllJournals = async (): Promise<IJournal[]> => {
  return await invoke("journal:get-all");
};

// 获取指定时间范围内的日志
export const getJournalsByTimeRange = async (
  startTime: number,
  endTime: number,
): Promise<IJournal[]> => {
  return await invoke("journal:get-by-time-range", startTime, endTime);
};

// 获取日记
export const getDailyJournal = async (
  timestamp: number,
): Promise<IJournal | null> => {
  return await invoke("journal:get-daily", timestamp);
};

// 获取周记
export const getWeeklyJournal = async (
  timestamp: number,
): Promise<IJournal | null> => {
  return await invoke("journal:get-weekly", timestamp);
};

// 获取月记
export const getMonthlyJournal = async (
  timestamp: number,
): Promise<IJournal | null> => {
  return await invoke("journal:get-monthly", timestamp);
};

// 获取年记
export const getYearlyJournal = async (
  timestamp: number,
): Promise<IJournal | null> => {
  return await invoke("journal:get-yearly", timestamp);
};

// 创建或获取日记
export const getOrCreateDailyJournal = async (
  timestamp: number,
  content: Descendant[] = defaultContent,
): Promise<IJournal> => {
  const journal = await getDailyJournal(timestamp);
  if (journal) return journal;

  const date = dayjs(timestamp);
  const startTime = date.startOf("day").valueOf();
  const endTime = date.endOf("day").valueOf();

  return await createJournal({
    type: "daily",
    startTime,
    endTime,
    content,
  });
};

// 创建或获取周记
export const getOrCreateWeeklyJournal = async (
  timestamp: number,
  content: Descendant[] = defaultContent,
): Promise<IJournal> => {
  const journal = await getWeeklyJournal(timestamp);
  if (journal) return journal;

  const date = dayjs(timestamp);
  // 使用 isoWeek 标准，周一作为一周的开始
  const startTime = date.startOf("isoWeek").valueOf();
  // 周日作为一周的结束
  const endTime = date.endOf("isoWeek").valueOf();

  return await createJournal({
    type: "weekly",
    startTime,
    endTime,
    content,
  });
};

// 创建或获取月记
export const getOrCreateMonthlyJournal = async (
  timestamp: number,
  content: Descendant[] = defaultContent,
): Promise<IJournal> => {
  const journal = await getMonthlyJournal(timestamp);
  if (journal) return journal;

  const date = dayjs(timestamp);
  // 月初
  const startTime = date.startOf("month").valueOf();
  // 月末
  const endTime = date.endOf("month").valueOf();

  return await createJournal({
    type: "monthly",
    startTime,
    endTime,
    content,
  });
};

// 创建或获取年记
export const getOrCreateYearlyJournal = async (
  timestamp: number,
  content: Descendant[] = defaultContent,
): Promise<IJournal> => {
  const journal = await getYearlyJournal(timestamp);
  if (journal) return journal;

  const date = dayjs(timestamp);
  // 年初
  const startTime = date.startOf("year").valueOf();
  // 年末
  const endTime = date.endOf("year").valueOf();

  return await createJournal({
    type: "yearly",
    startTime,
    endTime,
    content,
  });
};

// 检查指定日期是否存在日志
export const checkDailyJournalExists = async (
  timestamp: number,
): Promise<boolean> => {
  const journal = await getDailyJournal(timestamp);
  return !!journal;
};

// 获取一段时间范围内所有日期的日志存在状态
export const getJournalsExistsInRange = async (
  startTimestamp: number,
  endTimestamp: number,
  viewType: "daily" | "weekly" | "monthly" | "yearly",
): Promise<Record<string, boolean>> => {
  try {
    // 确保传入的是有效的数字
    const startTime = Number(startTimestamp);
    const endTime = Number(endTimestamp);

    if (isNaN(startTime) || isNaN(endTime)) {
      console.error("无效的时间戳:", startTimestamp, endTimestamp);
      return {};
    }

    const journals = await getJournalsByTimeRange(startTime, endTime);
    const existsMap: Record<string, boolean> = {};

    // 根据视图类型过滤日志
    const filteredJournals = journals.filter(
      (journal) => journal.type === viewType,
    );

    // 记录每个日志对应的日期键
    filteredJournals.forEach((journal) => {
      let dateKey;
      const date = dayjs(journal.startTime);

      if (viewType === "daily") {
        dateKey = date.format("YYYY-MM-DD");
      } else if (viewType === "weekly") {
        // 周的开始日期作为键，使用 ISO 周标准
        dateKey = `${date.year()}-W${date.isoWeek()}`;
      } else if (viewType === "monthly") {
        // 年月作为键
        dateKey = date.format("YYYY-MM");
      } else if (viewType === "yearly") {
        // 年作为键
        dateKey = date.year().toString();
      }

      if (dateKey) {
        existsMap[dateKey] = true;
      }
    });

    return existsMap;
  } catch (error) {
    console.error("获取日志存在状态失败:", error);
    return {};
  }
};

// 为了向后兼容，保留原接口
export const getDailyJournalsExistsInRange = async (
  startTimestamp: number,
  endTimestamp: number,
): Promise<Record<string, boolean>> => {
  return getJournalsExistsInRange(startTimestamp, endTimestamp, "daily");
};
