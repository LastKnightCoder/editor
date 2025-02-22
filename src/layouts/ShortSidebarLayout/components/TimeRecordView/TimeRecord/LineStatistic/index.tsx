import { Line } from '@ant-design/charts';
import { ITimeRecord } from "@/types";
import React from "react";

interface LineStatisticProps {
  timeRecords: ITimeRecord[];
  className?: string;
  style?: React.CSSProperties;
}

const LineStatistic = (props: LineStatisticProps) => {
  const { timeRecords, className, style } = props;

  const data = timeRecords.reduce((acc, cur) => {
    const index= acc.findIndex((item) => item.date === cur.date && item.eventType === cur.eventType);

    if (index !== -1) {
      acc[index].cost += cur.cost;
    } else {
      acc.push({ ...cur });
    }

    return acc;
  }, [] as ITimeRecord[]);

  const config = {
    data,
    xField: 'date',
    yField: 'cost',
    seriesField: 'timeType',
    shapeField: 'smooth',
    colorField: 'timeType',
    style,
    sort: {
      reverse: false,
    },
    axis: {
      x: {
        title: '日期',
      },
      y: {
        title: '花费时间(分钟)'
      }
    },
    color: ['#5B8FF9', '#5AD8A6', '#5D7092', '#F6BD16', '#E8684A', '#6DC8EC', '#9270CA', '#F6903D', '#BE0030', '#667CF3'],
    stack: true
  }

  return (
    <Line className={className} {...config} />
  );
}

export default LineStatistic;
