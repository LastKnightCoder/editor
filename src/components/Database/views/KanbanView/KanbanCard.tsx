import React, { memo, useRef, useState } from "react";
import { useDrag, useDrop } from "react-dnd";
import classnames from "classnames";
import { MdDelete } from "react-icons/md";
import { RowData, ColumnDef, CellValue } from "../../types";
import PluginManager from "../../PluginManager";

interface KanbanCardProps {
  row: RowData;
  columns: ColumnDef[];
  groupColumnId: string;
  pluginManager: PluginManager;
  theme: "light" | "dark";
  readonly?: boolean;
  onClick: () => void;
  onMove: (dragRowId: string, hoverRowId: string) => void;
  onChangeGroup: (rowId: string, newGroupValue: CellValue) => void;
  onDelete?: () => void;
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
    readonly,
    onClick,
    onMove,
    onChangeGroup,
    onDelete,
    index,
    groupValue,
  }) => {
    const ref = useRef<HTMLDivElement>(null);
    const [isHovered, setIsHovered] = useState(false);

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
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{ opacity: isDragging ? 0.5 : 1 }}
        className={classnames(
          "p-3 rounded-lg cursor-pointer transition-colors border relative",
          {
            "bg-white hover:bg-gray-50 border-gray-200": theme === "light",
            "bg-[#1f1f1f] hover:bg-[#2a2a2a] border-[#434343]":
              theme === "dark",
          },
        )}
      >
        {!readonly && onDelete && isHovered && (
          <div
            className={classnames(
              "absolute top-2 right-2 z-10 w-6 h-6 rounded-full flex items-center justify-center cursor-pointer transition-colors",
              {
                "bg-red-500 hover:bg-red-600 text-white": theme === "light",
                "bg-red-600 hover:bg-red-700 text-white": theme === "dark",
              },
            )}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <MdDelete className="w-4 h-4" />
          </div>
        )}
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
