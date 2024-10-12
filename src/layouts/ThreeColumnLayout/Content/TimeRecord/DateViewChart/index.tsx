import { useMemo } from "react";

import { ITimeRecord, TimeRecordGroup } from '@/types';

interface DateViewChartProps {
  timeRecords: TimeRecordGroup;
  date: string;
  Chart: ({ timeRecords }: { timeRecords: ITimeRecord[] }) => JSX.Element;
}

const DateViewChart = (props: DateViewChartProps) => {
  const { Chart, date, timeRecords } = props;
  
  const selectedTimeRecords = useMemo(() => {
    const selectedTimeRecords = timeRecords.filter(timeRecord => timeRecord.date === date);
    if (selectedTimeRecords.length > 0) {
      return selectedTimeRecords[0].timeRecords;
    }
    return [];
  }, [timeRecords, date]);
  
  return (
    <Chart timeRecords={selectedTimeRecords} />
  )
}

export default DateViewChart;