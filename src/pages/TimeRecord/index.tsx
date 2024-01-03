import ResizeableAndHideableSidebar from "@/components/ResizableAndHideableSidebar";
import Sidebar from './Sidebar';
import TimeRecordStatistic from './TimeRecordStatistic';

import styles from './index.module.less';

const TimeRecord = () => {
  return (
    <div className={styles.timeRecordContainer}>
      <ResizeableAndHideableSidebar minWidth={360} className={styles.sidebar}>
        <Sidebar />
      </ResizeableAndHideableSidebar>
      <div className={styles.content}>
        <TimeRecordStatistic />
      </div>
    </div>
  )
}

export default TimeRecord;