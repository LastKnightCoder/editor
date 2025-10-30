import React, { memo } from "react";
import { CellValue, ColumnDef } from "../../../types";
import { formatDateRange } from "../utils/dateUtils";
import { DatePluginConfig, DateValue } from "../index";

interface DateRendererProps {
  value: CellValue;
  column: ColumnDef;
}

const DateRenderer: React.FC<DateRendererProps> = memo(({ value, column }) => {
  if (!value)
    return (
      <div className="px-2 py-2 h-full w-full box-border flex items-center overflow-hidden text-ellipsis whitespace-nowrap"></div>
    );

  const config = column.config as DatePluginConfig | undefined;
  const dateValue = value as DateValue;

  const showTime = config?.showTime || false;
  const isRange = config?.isRange || false;

  const formattedDate = formatDateRange(dateValue, showTime, isRange);

  return (
    <div className="px-2 py-2 h-full w-full box-border flex items-center overflow-hidden text-ellipsis whitespace-nowrap">
      {formattedDate}
    </div>
  );
});

export default DateRenderer;
