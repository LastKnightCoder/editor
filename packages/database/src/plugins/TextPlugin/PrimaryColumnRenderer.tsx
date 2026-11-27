import React from "react";
import { PanelRight } from "lucide-react";
import { CellPlugin, CellValue, ColumnDef, RowData } from "../../types";
import { useMemoizedFn } from "ahooks";
import { Tooltip } from "@tau/ui";

const PrimaryColumnRenderer: React.FC<{
  value: CellValue;
  plugin: CellPlugin<unknown>;
  column: ColumnDef;
  theme: "light" | "dark";
  readonly: boolean;
  onCellValueChange: (newValue: CellValue) => void;
  className?: string;
  row?: RowData;
  onOpenDetail?: (row: RowData) => void;
}> = ({ value, plugin, column, theme, readonly, onCellValueChange, row, onOpenDetail }) => {
  const Renderer = plugin.Renderer;
  const handleOpenDetail = useMemoizedFn((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (row && onOpenDetail) {
      onOpenDetail(row);
    }
  });

  return (
    <div className="relative flex h-full w-full items-center">
      <div className="h-full min-w-0 flex-1">
        <Renderer
          value={value}
          column={column}
          theme={theme}
          readonly={readonly}
          onCellValueChange={onCellValueChange}
        />
      </div>
      <div
        className="bg-surface-hover text-ink-2 rounded-tau-sm absolute top-1/2 right-1 flex -translate-y-1/2 items-center gap-1 px-1.5 py-1"
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
