import { useMemo } from "react";
import { CalendarEvent } from "@/types";
import { eventsOverlap } from "@/utils/calendar";

interface EventPosition {
  left: number; // 百分比
  width: number; // 百分比
  zIndex: number;
}

/**
 * 计算事件重叠，返回每个事件的位置和宽度
 */
export const useEventOverlap = (
  events: CalendarEvent[],
): Map<number, EventPosition> => {
  return useMemo(() => {
    const positions = new Map<number, EventPosition>();

    if (events.length === 0) {
      return positions;
    }

    // 按开始时间排序
    const sortedEvents = [...events].sort((a, b) => {
      const aStart = a.startTime || 0;
      const bStart = b.startTime || 0;
      return aStart - bStart;
    });

    // 找出所有重叠组
    const groups: CalendarEvent[][] = [];
    let currentGroup: CalendarEvent[] = [sortedEvents[0]];

    for (let i = 1; i < sortedEvents.length; i++) {
      const event = sortedEvents[i];
      const overlapsWithGroup = currentGroup.some((e) =>
        eventsOverlap(e, event),
      );

      if (overlapsWithGroup) {
        currentGroup.push(event);
      } else {
        groups.push(currentGroup);
        currentGroup = [event];
      }
    }
    groups.push(currentGroup);

    // 为每个组内的事件分配列位置
    groups.forEach((group) => {
      if (group.length === 1) {
        // 单个事件，占满宽度
        positions.set(group[0].id, {
          left: 0,
          width: 100,
          zIndex: 1,
        });
      } else {
        // 多个事件重叠，分配列
        const columns: CalendarEvent[][] = [];

        group.forEach((event) => {
          // 找到第一个不与当前事件重叠的列
          let placed = false;
          for (let col = 0; col < columns.length; col++) {
            const overlaps = columns[col].some((e) => eventsOverlap(e, event));
            if (!overlaps) {
              columns[col].push(event);
              placed = true;
              break;
            }
          }

          // 如果没有找到合适的列，创建新列
          if (!placed) {
            columns.push([event]);
          }
        });

        // 计算每个事件的位置
        const columnCount = columns.length;
        const width = 100 / columnCount;

        columns.forEach((column, colIndex) => {
          column.forEach((event) => {
            positions.set(event.id, {
              left: colIndex * width,
              width: width,
              zIndex: colIndex + 1,
            });
          });
        });
      }
    });

    return positions;
  }, [events]);
};
