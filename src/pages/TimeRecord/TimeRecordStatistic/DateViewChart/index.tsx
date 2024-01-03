import { useMemo, useState } from "react";
import { DatePicker } from "antd";
import dayjs, { Dayjs } from "dayjs";

import useTimeRecordStore from "@/stores/useTimeRecordStore";
import { useMemoizedFn } from "ahooks";

import styles from './index.module.less';

interface DateViewChartProps {
  Chart: any;
}

const DateViewChart = (props: DateViewChartProps) => {
  const { Chart } = props;
  
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'));
  const {
    timeRecords
  } = useTimeRecordStore((state) => ({
    timeRecords: state.timeRecords
  }));
  
  const selectedTimeRecords = useMemo(() => {
    const selectedTimeRecords = timeRecords.filter(timeRecord => timeRecord.date === date);
    if (selectedTimeRecords.length > 0) {
      return selectedTimeRecords[0].timeRecords;
    }
    return [];
  }, [timeRecords, date]);

  const onDateChange = useMemoizedFn((date: Dayjs | null) => {
    if (!date) return;
    setDate(date.format('YYYY-MM-DD'))
  });
  
  return (
    <div className={styles.dateView}>
      <DatePicker className={styles.datePicker} value={dayjs(date)} onChange={onDateChange} />
      <Chart timeRecords={selectedTimeRecords} />
    </div>
  )
}

export default DateViewChart;