import { Table, TableProps } from "antd";
import { useEffect, useRef, useState } from "react";
import { useSize } from "ahooks";

import styles from './index.module.less';

const AutoHeightTable = (props: TableProps) => {
  const target = useRef<HTMLDivElement>(null);
  const size = useSize(target); // resizeObserver获取target的contentRect大小
  const [tableHeight, setTableHeight] = useState(433); // 表格高度，默认值大约显示10行

  useEffect(() => {
    if (size?.height) {
      const headerHeight = target.current?.firstElementChild?.getElementsByClassName('ant-table-header')[0]?.clientHeight || 39;
      const paginationHeight = target.current?.firstElementChild?.getElementsByClassName('ant-table-pagination')[0]?.clientHeight || 0;
      const newHeight = size.height - headerHeight - ((paginationHeight || - 24) + 24);
      setTableHeight(Math.round(newHeight));
    }
  }, [size?.height]);

  return (
    <div className={styles.container} ref={target}>
      <Table
        {...props}
        className={styles.table}
        scroll={{
          ...props.scroll,
          y: tableHeight
        }}
      />
    </div>
  )
}

export default AutoHeightTable;
