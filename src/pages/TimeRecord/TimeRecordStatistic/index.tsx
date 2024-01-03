import DateViewChart from "./DateViewChart";
import PieStatistic from "./PieStatistic";

import styles from './index.module.less';

const TimeRecordStatistic = () => {
  return (
    <div className={styles.charts}>
      <DateViewChart Chart={PieStatistic} />
    </div>
  )
}

export default TimeRecordStatistic;