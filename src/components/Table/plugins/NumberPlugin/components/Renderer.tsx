import React, { memo } from "react";
import { CellValue, ColumnDef } from "../../../types";
import { formatNumber } from "../utils/numberUtils";

interface NumberRendererProps {
  value: CellValue;
  column: ColumnDef;
}

const NumberRenderer: React.FC<NumberRendererProps> = memo(
  ({ value, column }) => {
    const config = column.config as {
      precision?: number;
      thousandSeparator?: boolean;
      prefix?: string;
      suffix?: string;
    };
    const formattedValue = formatNumber(value as number | string, config);

    return (
      <div className="w-full h-full px-2 py-2 flex items-center overflow-hidden text-ellipsis whitespace-nowrap box-border">
        {formattedValue}
      </div>
    );
  },
);

export default NumberRenderer;
