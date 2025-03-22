import { ITimeRecord } from "@/types";
import React, { memo } from "react";
import useTheme from "@/hooks/useTheme.ts";
import { Column } from "@ant-design/charts";

interface StackColumnStatisticProps {
  timeRecords: ITimeRecord[];
  category: string;
  className?: string;
  style?: React.CSSProperties;
}

const StackColumnStatistic = memo((props: StackColumnStatisticProps) => {
  const { timeRecords, className, style, category } = props;

  const { isDark } = useTheme();

  let data: ITimeRecord[] = [];
  if (category === "timeType") {
    // 合并所有 eventType 和 timeType 相同的记录，cost 相加
    data = timeRecords.reduce((acc, cur) => {
      const index = acc.findIndex(
        (item) =>
          item.eventType === cur.eventType && item.timeType === cur.timeType,
      );
      if (index !== -1) {
        acc[index].cost += cur.cost;
      } else {
        acc.push({ ...cur });
      }
      return acc;
    }, [] as ITimeRecord[]);
  } else if (category === "date") {
    data = timeRecords.reduce((acc, cur) => {
      const index = acc.findIndex(
        (item) => item.date === cur.date && item.eventType === cur.eventType,
      );

      if (index !== -1) {
        acc[index].cost += cur.cost;
      } else {
        acc.push({ ...cur });
      }

      return acc;
    }, [] as ITimeRecord[]);
  }

  const config = {
    data,
    xField: category,
    yField: "cost",
    colorField: "eventType",
    stack: true,
    style: {
      maxWidth: 80,
      ...style,
    },
    sort: {
      reverse: false,
    },
    axis: {
      x: {
        title: category === "timeType" ? "时间类型" : "日期",
      },
      y: {
        title: "花费时间(分钟)",
      },
    },
    color: [
      "#5B8FF9",
      "#5AD8A6",
      "#5D7092",
      "#F6BD16",
      "#E8684A",
      "#6DC8EC",
      "#9270CA",
      "#F6903D",
      "#BE0030",
      "#667CF3",
    ],
    theme: isDark ? "classicDark" : "classic",
  };

  return <Column className={className} {...config} />;
});

export default StackColumnStatistic;
