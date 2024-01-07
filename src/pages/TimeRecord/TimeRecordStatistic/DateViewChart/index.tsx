import { useMemo } from "react";

import useTimeRecordStore from "@/stores/useTimeRecordStore";

import { ITimeRecord } from '@/types';

interface DateViewChartProps {
  Chart: ({ timeRecords }: { timeRecords: ITimeRecord[] }) => JSX.Element;
}

const DateViewChart = (props: DateViewChartProps) => {
  const { Chart } = props;
  
  const {
    timeRecords,
    currentDate
  } = useTimeRecordStore((state) => ({
    timeRecords: state.timeRecords,
    currentDate: state.currentDate,
  }));
  
  const selectedTimeRecords = useMemo(() => {
    const selectedTimeRecords = timeRecords.filter(timeRecord => timeRecord.date === currentDate);
    if (selectedTimeRecords.length > 0) {
      return selectedTimeRecords[0].timeRecords;
    }
    return [];
  }, [timeRecords, currentDate]);
  
  return (
    <Chart timeRecords={selectedTimeRecords} />
  )
}

export default DateViewChart;