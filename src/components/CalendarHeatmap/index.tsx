import React, { useEffect, useMemo, useRef, useState } from "react";
import { Tooltip } from "antd";
import dayjs from 'dayjs';
import { useMemoizedFn } from "ahooks";
import classnames from "classnames";

import styles from './index.module.less';
import { Operation } from "@/types";

export interface IItem {
  date: string;
  count: number;
  operationList: Operation[]
  [key: string]: any;
}

export interface ICalendarHeatmapProps {
  className?: string;
  style?: React.CSSProperties;
  data: Array<IItem>,
  year: string;
  gap?: number;
  renderTooltip?: (date: string, value?: IItem) => React.ReactNode;
}

const CalendarHeatmap = (props: ICalendarHeatmapProps) => {
  const { data, year, gap = 5, renderTooltip, className, style } = props;
  const [[width, height], setWidth] = useState([10, 10]);
  const ref = useRef<HTMLDivElement | null>(null);

  const weeks = useMemo(() => {
    const start = dayjs(year).startOf('year');
    const end = dayjs(year).endOf('year');
    const days = end.diff(start, 'day') + 1;
    let current = start;

    const weeks: Array<string[]> = [];
    let week: string[] = [];
    for (let i = 0; i < days; i++) {
      week.push(current.format('YYYY-MM-DD'));
      if (current.day() === 0) {
        weeks.push(week);
        week = [];
      }
      current = current.add(1, 'day');
    }

    return weeks;
  }, [year]);

  const calcWidth = useMemoizedFn(() => {
    if (!ref.current) return [10, 10];
    const containerWidth = ref.current.clientWidth;
    const itemWidth = (containerWidth - gap * (weeks.length - 1)) / weeks.length;
    return [itemWidth, itemWidth];
  })

  useEffect(() => {
    const [width, height] = calcWidth();
    setWidth([width, height]);
  }, [calcWidth]);

  useEffect(() => {
    if (!ref.current) return ;
    const onResize = () => {
      const [width, height] = calcWidth();
      setWidth([width, height]);
    }
    const observer = new ResizeObserver(onResize);
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
    }
  }, [calcWidth]);

  return (
    <div className={className} style={style}>
      <div ref={ref} className={styles.calendar} style={{ gap }}>
        {weeks.map((week, index) => {
          return (
            <div key={index} className={styles.week} style={{ gap }}>
              {week.map((day) => {
                const dataItem = data.find((item) => item.date === day);
                return (
                  <Tooltip
                    key={day}
                    title={renderTooltip ? renderTooltip(day, dataItem) : undefined}
                  >
                    <div
                      style={{
                        width: width,
                        height: height,
                      }}
                      key={day}
                      className={classnames(styles.day)}
                    >
                      <div className={classnames(styles.dayItem, {
                        [styles.empty]: !dataItem,
                        [styles.colorScale1]: dataItem && dataItem.count < 5,
                        [styles.colorScale2]: dataItem && dataItem.count >= 5 && dataItem.count < 10,
                        [styles.colorScale3]: dataItem && dataItem.count >= 10 && dataItem.count < 20,
                        [styles.colorScale4]: dataItem && dataItem.count >= 20,
                      })}></div>
                    </div>
                  </Tooltip>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default CalendarHeatmap;
