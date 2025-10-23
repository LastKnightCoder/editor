import dayjs from "dayjs";
import { CalendarEvent } from "@/types";

/**
 * 事件布局算法
 * 用于计算日历中事件的垂直层级（level），确保：
 * 1. 事件不重叠
 * 2. 紧凑布局（优先使用较低的层级）
 * 3. 尽可能多地显示事件
 */

interface EventWithRange {
  event: CalendarEvent;
  startDay: number; // 相对于周开始的天数
  endDay: number; // 相对于周开始的天数
}

interface EventLevel {
  event: CalendarEvent;
  level: number;
}

/**
 * 为周视图的全天事件分配层级
 * @param events 所有全天事件
 * @param weekStart 周开始日期
 * @returns 事件及其层级的映射
 */
export function assignWeekViewLevels(
  events: CalendarEvent[],
  weekStart: Date,
): Map<number, number> {
  const weekStartDay = dayjs(weekStart);

  // 1. 将所有事件转换为带范围的格式
  const eventsWithRange: EventWithRange[] = events.map((event) => {
    const startDate = dayjs(event.startDate);
    const endDate = event.endDate ? dayjs(event.endDate) : startDate;

    return {
      event,
      startDay: startDate.diff(weekStartDay, "day"),
      endDay: endDate.diff(weekStartDay, "day"),
    };
  });

  // 2. 按开始日期排序（相同开始日期时，结束日期晚的在前）
  eventsWithRange.sort((a, b) => {
    if (a.startDay !== b.startDay) {
      return a.startDay - b.startDay;
    }
    return b.endDay - a.endDay; // 结束晚的优先（更长的事件）
  });

  // 3. 贪心算法分配层级
  const result = new Map<number, number>();

  // 追踪每个层级当前占用的最大结束日期
  const levelEndDays: number[] = [];

  for (const { event, startDay, endDay } of eventsWithRange) {
    // 找到第一个可用的层级（该层级的结束日期小于当前事件的开始日期）
    let assignedLevel = -1;

    for (let level = 0; level < levelEndDays.length; level++) {
      if (levelEndDays[level] < startDay) {
        // 这个层级可用
        assignedLevel = level;
        levelEndDays[level] = endDay; // 更新该层级的结束日期
        break;
      }
    }

    // 如果没有可用层级，创建新层级
    if (assignedLevel === -1) {
      assignedLevel = levelEndDays.length;
      levelEndDays.push(endDay);
    }

    result.set(event.id, assignedLevel);
  }

  return result;
}

/**
 * 月视图的跨天事件布局信息
 */
export interface MonthEventSpan {
  eventId: number;
  row: number;
  startCol: number;
  endCol: number;
  width: number;
  spanType: "single" | "start" | "middle" | "end";
}

/**
 * 排序策略类型
 */
export type SortStrategy = "endTimeFirst" | "durationFirst";

/**
 * 为月视图的跨天事件分配层级
 * @param events 所有跨天事件及其 span 信息
 * @param maxLevels 每行最多显示的层级数
 * @param strategy 排序策略：'endTimeFirst' 结束时间优先（短事件优先），'durationFirst' 长度优先（长事件优先）
 * @returns 每行的事件布局信息
 */
export function assignMonthViewLevels(
  events: Array<{
    event: CalendarEvent;
    spans: MonthEventSpan[];
  }>,
  maxLevels: number,
  strategy: SortStrategy = "endTimeFirst",
): Map<
  number,
  Array<{ eventId: number; span: MonthEventSpan; level: number }>
> {
  // 结果：每行的事件布局
  const rowLayouts = new Map<
    number,
    Array<{ eventId: number; span: MonthEventSpan; level: number }>
  >();

  // 1. 按开始日期排序事件，相同开始日期时根据策略选择不同的次要排序
  const sortedEvents = [...events].sort((a, b) => {
    const aStart = dayjs(a.event.startDate).valueOf();
    const bStart = dayjs(b.event.startDate).valueOf();
    if (aStart !== bStart) {
      return aStart - bStart;
    }

    if (strategy === "endTimeFirst") {
      // 策略1：结束时间早的优先（短事件优先）
      // 这是区间调度问题的最优策略：优先选择结束早的事件，可以更早释放空间
      const aEnd = dayjs(a.event.endDate || a.event.startDate).valueOf();
      const bEnd = dayjs(b.event.endDate || b.event.startDate).valueOf();
      return aEnd - bEnd;
    } else {
      // 策略2：长度优先（长事件优先）
      // 让长事件先占据底层，短事件填充空隙
      const aDuration = dayjs(a.event.endDate || a.event.startDate).diff(
        dayjs(a.event.startDate),
        "day",
      );
      const bDuration = dayjs(b.event.endDate || b.event.startDate).diff(
        dayjs(b.event.startDate),
        "day",
      );
      return bDuration - aDuration; // 长度降序
    }
  });

  sortedEvents.forEach((item, index) => {
    const startDate = dayjs(item.event.startDate).format("MM-DD");
    const endDate = item.event.endDate
      ? dayjs(item.event.endDate).format("MM-DD")
      : startDate;
    const duration = dayjs(item.event.endDate || item.event.startDate).diff(
      dayjs(item.event.startDate),
      "day",
    );
    console.log(
      `  ${index + 1}. [${item.event.title}] ${startDate} → ${endDate} (${duration}天), spans:`,
      item.spans
        .map((s) => `row${s.row}[col${s.startCol}-${s.endCol}]`)
        .join(", "),
    );
  });

  // 2. 为每行维护层级占用情况
  // rowLevelOccupancy[row][level] = 该行该层级占用到的最大列
  const rowLevelOccupancy = new Map<number, number[]>();

  // 初始化所有行
  const allRows = new Set<number>();
  events.forEach(({ spans }) => {
    spans.forEach((span) => allRows.add(span.row));
  });
  allRows.forEach((row) => {
    rowLevelOccupancy.set(row, Array(maxLevels).fill(-1));
    rowLayouts.set(row, []);
  });

  for (const { event, spans } of sortedEvents) {
    // 找到所有行中都可用的最小层级
    let assignedLevel = -1;

    for (let level = 0; level < maxLevels; level++) {
      // 检查这个层级在所有相关行的所有 span 位置是否都可用
      const checkResults: Array<{
        row: number;
        startCol: number;
        occupiedUntil: number;
        canUse: boolean;
      }> = [];

      const canUseLevel = spans.every((span) => {
        const occupancy = rowLevelOccupancy.get(span.row);
        if (!occupancy) {
          checkResults.push({
            row: span.row,
            startCol: span.startCol,
            occupiedUntil: -1,
            canUse: false,
          });
          return false;
        }

        const occupiedUntil = occupancy[level];
        const canUse = occupiedUntil < span.startCol;
        checkResults.push({
          row: span.row,
          startCol: span.startCol,
          occupiedUntil,
          canUse,
        });

        // 检查该层级的占用是否在当前 span 开始之前结束
        return canUse;
      });

      if (canUseLevel) {
        assignedLevel = level;
        break;
      }
    }

    // 如果找到了可用的层级，分配并更新占用情况
    if (assignedLevel !== -1) {
      spans.forEach((span) => {
        const occupancy = rowLevelOccupancy.get(span.row)!;
        occupancy[assignedLevel] = span.endCol; // 更新该层级的占用

        const layout = rowLayouts.get(span.row)!;
        layout.push({
          eventId: event.id,
          span,
          level: assignedLevel,
        });
      });
    }
  }

  return rowLayouts;
}

/**
 * 计算月视图中单个日期单元格内的单日事件布局
 * @param events 单日事件列表
 * @param maxEvents 最多显示的事件数
 * @returns 事件及其层级
 */
export function assignSingleDayEventsLevels(
  events: CalendarEvent[],
  maxEvents: number,
): EventLevel[] {
  // 按开始时间排序
  const sortedEvents = [...events].sort((a, b) => {
    return dayjs(a.startDate).valueOf() - dayjs(b.startDate).valueOf();
  });

  // 简单分配：前 N 个事件按顺序分配
  return sortedEvents.slice(0, maxEvents).map((event, index) => ({
    event,
    level: index,
  }));
}
