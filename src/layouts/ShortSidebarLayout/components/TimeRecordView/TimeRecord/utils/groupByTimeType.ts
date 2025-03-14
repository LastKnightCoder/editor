import { ITimeRecord } from "@/types";
import groupByEventType from "./groupByEventType.ts";

const groupByTimeType = (timeRecords: ITimeRecord[]) => {
  // 将 timeRecords 根据 eventType 进行分类
  const timeTypeMap = new Map<string, ITimeRecord[]>();
  timeRecords.forEach((timeRecord) => {
    const { timeType } = timeRecord;
    if (!timeTypeMap.has(timeType)) {
      timeTypeMap.set(timeType, []);
    }
    timeTypeMap.get(timeType)?.push(timeRecord);
  });

  // 将每组的 cost 加起来
  return Array.from(timeTypeMap.entries()).map(([timeType, timeRecords]) => ({
    timeType,
    eventGroup: groupByEventType(timeRecords),
    totalCost: timeRecords.reduce((acc, cur) => acc + cur.cost, 0),
  }));
};

export default groupByTimeType;
