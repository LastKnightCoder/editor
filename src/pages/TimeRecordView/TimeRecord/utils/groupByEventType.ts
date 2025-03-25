import { ITimeRecord } from "@/types";

const groupByEventType = (timeRecords: ITimeRecord[]) => {
  // 将 timeRecords 根据 eventType 进行分类
  const eventTypeMap = new Map<string, ITimeRecord[]>();
  timeRecords.forEach((timeRecord) => {
    const { eventType } = timeRecord;
    if (!eventTypeMap.has(eventType)) {
      eventTypeMap.set(eventType, []);
    }
    eventTypeMap.get(eventType)?.push(timeRecord);
  });

  // 将每组的 cost 加起来
  return Array.from(eventTypeMap.entries()).map(([eventType, timeRecords]) => ({
    eventType,
    cost: timeRecords.reduce((acc, cur) => acc + cur.cost, 0),
  }));
};

export default groupByEventType;
