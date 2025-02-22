import { Column } from '@ant-design/charts';
import { ITimeRecord } from '@/types';
import React from "react";
import groupByEventType from "../utils/groupByEventType.ts";
import useTheme from "@/hooks/useTheme.ts";

interface BarStatisticProps {
  timeRecords: ITimeRecord[];
  className?: string;
  style?: React.CSSProperties;
}

const ColumnStatistic = (props: BarStatisticProps) => {
  const { timeRecords, className, style } = props;

  const data = groupByEventType(timeRecords);

  const { isDark } = useTheme();

  const config = {
    data,
    xField: 'eventType',
    yField: 'cost',
    style: {
      maxWidth: 80,
      ...style,
    },
    axis: {
      x: {
        title: '事件类型'
      },
      y: {
        title: '花费时间(分钟)'
      }
    },
    colorField: 'eventType',
    color: ['#5B8FF9', '#5AD8A6', '#5D7092', '#F6BD16', '#E8684A', '#6DC8EC', '#9270CA', '#F6903D', '#BE0030', '#667CF3'],
    theme: isDark ? 'classicDark' : 'classic',
    meta: {
      eventType: { alias: '事件类型' },
      cost: { alias: '花费事件(分钟)' },
    },
  }

  return <Column className={className} {...config} />;
}

export default ColumnStatistic;
