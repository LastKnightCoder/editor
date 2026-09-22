import React from "react";
import { PanelRight } from "lucide-react";
import { CellValue, ColumnDef, RowData } from "../../types";
import { useMemoizedFn } from "ahooks";
import { Tooltip } from "@tau/ui";
import EditText from "@/components/EditText";

const PrimaryColumnRenderer: React.FC<{
  value: CellValue;
  column: ColumnDef;
  theme: "light" | "dark";
  readonly: boolean;
  onCellValueChange: (newValue: CellValue) => void;
  className?: string;
  row?: RowData;
  onOpenDetail?: (row: RowData) => void;
}> = ({ value, row, onOpenDetail }) => {
  const handleOpenDetail = useMemoizedFn((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (row && onOpenDetail) {
      onOpenDetail(row);
    }
  });

  return (
    <div className="relative flex h-full w-full items-center">
      <EditText
        key={value}
        defaultValue={value}
        contentEditable={false}
        className="text-ink-1 text-tau-body box-border flex h-full w-full items-center overflow-hidden text-ellipsis whitespace-nowrap px-2 py-2"
      />
      <div
        className="bg-group text-ink-2 rounded-tau-sm absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-1 px-1.5 py-1"
        onDoubleClick={e => {
          e.stopPropagation();
          e.preventDefault();
        }}
      >
        <Tooltip content="打开详情" delay={1000}>
          <PanelRight
            onClick={handleOpenDetail}
            className="hover:text-ink-1 h-4 w-4 cursor-pointer"
            strokeWidth={1.75}
          />
        </Tooltip>
      </div>
    </div>
  );
};

export default PrimaryColumnRenderer;
