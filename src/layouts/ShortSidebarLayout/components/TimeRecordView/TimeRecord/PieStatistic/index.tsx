import { Pie } from "@ant-design/charts";
import useTheme from "@/hooks/useTheme.ts";
import { ITimeRecord } from "@/types";
import groupByEventType from "../utils/groupByEventType.ts";

interface PieStatisticProps {
  timeRecords: ITimeRecord[];
}

const PieStatistic = (props: PieStatisticProps) => {
  const { timeRecords } = props;

  const { isDark } = useTheme();

  const data = groupByEventType(timeRecords);

  const config = {
    autoFit: true,
    appendPadding: 10,
    data,
    angleField: "cost",
    colorField: "eventType",
    radius: 0.8,
    label: {
      text: (d: (typeof data)[number]) => `${d.eventType}\n ${d.cost}`,
      position: "spider",
    },
    interactions: [
      {
        type: "element-selected",
      },
      {
        type: "element-active",
      },
    ],
    legend: {
      color: {
        title: false,
        position: "right",
        rowPadding: 5,
      },
    },
    theme: isDark ? "classicDark" : "classic",
  };

  return <Pie {...config} />;
};

export default PieStatistic;
