import { Pie } from '@ant-design/charts';
import useTheme from "@/hooks/useTheme";
import { ITimeRecord } from "@/types";

interface PieStatisticProps {
  timeRecords: ITimeRecord[];
}

const PieStatistic = (props: PieStatisticProps) => {
  const {
    timeRecords,
  } = props;

  const { isDark } = useTheme();

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
  const data = Array.from(eventTypeMap.entries()).map(([eventType, timeRecords]) => ({
    eventType,
    cost: timeRecords.reduce((acc, cur) => acc + cur.cost, 0),
  }));

  const config = {
    autoFit: true,
    appendPadding: 10,
    data,
    angleField: 'cost',
    colorField: 'eventType',
    radius: 0.8,
    label: {
      text: (d: typeof data[number]) => `${d.eventType}\n ${d.cost}`,
      position: 'spider',
    },
    interactions: [
      {
        type: 'element-selected',
      },
      {
        type: 'element-active',
      },
    ],
    legend: {
      color: {
        title: false,
        position: 'right',
        rowPadding: 5,
      },
    },
    theme: isDark ? 'classicDark' : 'classic',
  };

  return (
    <Pie {...config} />
  )
}

export default PieStatistic;