import React, { memo } from "react";
import { CellValue, ColumnDef } from "../../../types";
import { formatDate } from "../utils/dateUtils";

/**
 * 日期单元格渲染器组件（只读模式）
 */
interface DateRendererProps {
  value: CellValue;
  column: ColumnDef;
}

const DateRenderer: React.FC<DateRendererProps> = memo(({ value, column }) => {
  if (!value)
    return (
      <div className="px-2 py-2 h-full w-full box-border flex items-center overflow-hidden text-ellipsis whitespace-nowrap"></div>
    );

  const config = column.config as { format?: string };

  const dateFormat = config?.format || "YYYY-MM-DD";
  const formattedDate = formatDate(value as number | null, dateFormat);

  return (
    <div className="px-[27px] py-2 h-full w-full box-border flex items-center overflow-hidden text-ellipsis whitespace-nowrap">
      {formattedDate}
    </div>
  );
});

export default DateRenderer;
