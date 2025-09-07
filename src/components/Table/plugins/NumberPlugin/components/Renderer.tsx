import React, { memo } from "react";
import { CellValue, ColumnDef } from "../../../types";
import { formatNumber } from "../utils/numberUtils";

/**
 * 数字单元格渲染器组件（只读模式）
 */
interface NumberRendererProps {
  value: CellValue;
  config?: {
    precision?: number;
    thousandSeparator?: boolean;
    prefix?: string;
    suffix?: string;
  };
  column: ColumnDef;
}

const NumberRenderer: React.FC<NumberRendererProps> = memo(
  ({ value, config }) => {
    const formattedValue = formatNumber(value as number | string, config);

    return (
      <div className="w-full h-full px-4 py-2 flex items-center overflow-hidden text-ellipsis whitespace-nowrap box-border">
        {formattedValue}
      </div>
    );
  },
);

export default NumberRenderer;
