import React from "react";
import { CellValue, ColumnDef, RowData } from "../../types";
import { TbLayoutSidebarRight } from "react-icons/tb";
import { useMemoizedFn } from "ahooks";
import { Tooltip } from "antd";

const PrimaryColumnRenderer: React.FC<{
  value: CellValue;
  column: ColumnDef;
  theme: "light" | "dark";
  readonly: boolean;
  onCellValueChange: (newValue: CellValue) => void;
  className?: string;
  row?: RowData;
  onOpenDetail?: (row: RowData) => void;
}> = ({ value, theme, row, onOpenDetail }) => {
  const isDark = theme === "dark";

  const handleOpenDetail = useMemoizedFn((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (row && onOpenDetail) {
      onOpenDetail(row);
    }
  });

  return (
    <div className="relative w-full h-full flex items-center">
      <div className="px-2 truncate max-w-full">
        <span className="cursor-text select-text truncate">
          {String(value || "")}
        </span>
      </div>

      <div
        className={
          "absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1 px-1.5 py-1 rounded-md cursor-pointer" +
          (isDark
            ? " bg-gray-700/80 text-gray-200"
            : " bg-gray-200/80 text-gray-700")
        }
        onDoubleClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
      >
        <Tooltip title="打开详情" mouseEnterDelay={1}>
          <TbLayoutSidebarRight
            onClick={handleOpenDetail}
            className="w-4 h-4"
          />
        </Tooltip>
      </div>
    </div>
  );
};

export default PrimaryColumnRenderer;
