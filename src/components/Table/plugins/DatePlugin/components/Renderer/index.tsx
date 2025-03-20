import React, { memo } from "react";
import { CellValue, ColumnDef } from "../../../../types";
import { formatDate } from "../../utils/dateUtils";
import styles from "./index.module.less";

/**
 * 日期单元格渲染器组件（只读模式）
 */
interface DateRendererProps {
  value: CellValue;
  config?: { format?: string };
  column: ColumnDef;
}

const DateRenderer: React.FC<DateRendererProps> = memo(({ value, config }) => {
  if (!value) return <div className={styles.content}></div>;

  const dateFormat = config?.format || "YYYY-MM-DD";
  const formattedDate = formatDate(value as Date | string, dateFormat);

  return <div className={styles.content}>{formattedDate}</div>;
});

export default DateRenderer;
