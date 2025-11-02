import React, { memo, useRef } from "react";
import { useDrag, useDrop } from "react-dnd";
import classnames from "classnames";
import { RowData, ColumnDef, CellValue } from "../../types";
import PluginManager from "../../PluginManager";

interface KanbanCardProps {
  row: RowData;
  columns: ColumnDef[];
  groupColumnId: string;
  pluginManager: PluginManager;
  theme: "light" | "dark";
  onClick: () => void;
  onMove: (dragRowId: string, hoverRowId: string) => void;
  onChangeGroup: (rowId: string, newGroupValue: CellValue) => void;
  index: number;
  groupValue: CellValue;
}

interface DragItem {
  type: string;
  rowId: string;
  index: number;
  groupValue: CellValue;
}

const emptyOnCellChange = () => {
  // no-op
};

const KanbanCard: React.FC<KanbanCardProps> = memo(
  ({
    row,
    columns,
    pluginManager,
    theme,
    onClick,
    onMove,
    onChangeGroup,
    index,
    groupValue,
  }) => {
    const ref = useRef<HTMLDivElement>(null);

    const [{ isDragging }, drag] = useDrag({
      type: "kanban-card",
      item: { type: "kanban-card", rowId: row.id, index, groupValue },
      collect: (monitor) => ({
        isDragging: monitor.isDragging(),
      }),
    });

    const [, drop] = useDrop<DragItem>({
      accept: "kanban-card",
      hover: (item) => {
        if (!ref.current) return;

        // 如果是同一张卡片，不处理
        if (item.rowId === row.id) return;

        // 如果拖到不同的组，更新卡片的分组值
        if (item.groupValue !== groupValue) {
          onChangeGroup(item.rowId, groupValue);
          item.groupValue = groupValue;
          item.index = index;
          return;
        }

        // 同一组内的重新排序
        if (item.index !== index) {
          onMove(item.rowId, row.id);
          item.index = index;
        }
      },
    });

    drag(drop(ref));

    // 获取主列
    const primaryColumn = columns.find((col) => col.isPrimary);

    return (
      <div
        ref={ref}
        onClick={onClick}
        style={{ opacity: isDragging ? 0.5 : 1 }}
        className={classnames(
          "p-3 rounded-lg cursor-pointer transition-colors border",
          {
            "bg-white hover:bg-gray-50 border-gray-200": theme === "light",
            "bg-[#1f1f1f] hover:bg-[#2a2a2a] border-[#434343]":
              theme === "dark",
          },
        )}
      >
        {/* 主列内容 */}
        {primaryColumn && (
          <div>
            {(() => {
              const plugin = pluginManager.getPlugin(primaryColumn.type);
              const Renderer = plugin?.Renderer;
              if (!Renderer) return null;
              return (
                <div className="font-medium">
                  <Renderer
                    value={row[primaryColumn.id]}
                    column={primaryColumn}
                    theme={theme}
                    readonly
                    onCellValueChange={emptyOnCellChange}
                  />
                </div>
              );
            })()}
          </div>
        )}
      </div>
    );
  },
);

KanbanCard.displayName = "KanbanCard";

export default KanbanCard;
