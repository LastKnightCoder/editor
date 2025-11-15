import React, { memo, useRef } from "react";
import { useDrag, useDrop } from "react-dnd";
import classnames from "classnames";
import { RowData, ColumnDef, CellValue } from "../../types";
import PluginManager from "../../PluginManager";
import KanbanCard from "./KanbanCard";
import AddCard from "./AddCard";

interface KanbanColumnProps {
  groupValue: CellValue;
  groupLabel: string;
  rows: RowData[];
  columns: ColumnDef[];
  groupColumn: ColumnDef;
  pluginManager: PluginManager;
  theme: "light" | "dark";
  readonly: boolean;
  onCardClick: (row: RowData) => void;
  onAddCard: (groupValue: CellValue) => void;
  onMoveCard: (dragRowId: string, hoverRowId: string) => void;
  onChangeCardGroup: (rowId: string, newGroupValue: CellValue) => void;
  onMoveColumn: (dragGroupValue: CellValue, hoverGroupValue: CellValue) => void;
  onDeleteCard?: (rowId: string) => void;
  index: number;
}

interface DragItem {
  type: string;
  groupValue: CellValue;
  index: number;
}

const emptyOnCellChange = () => {
  // no-op
};

const KanbanColumn: React.FC<KanbanColumnProps> = memo(
  ({
    groupValue,
    groupLabel,
    rows,
    columns,
    groupColumn,
    pluginManager,
    theme,
    readonly,
    onCardClick,
    onAddCard,
    onMoveCard,
    onChangeCardGroup,
    onMoveColumn,
    onDeleteCard,
    index,
  }) => {
    const ref = useRef<HTMLDivElement>(null);

    const [{ isDragging }, drag] = useDrag({
      type: "kanban-column",
      item: { type: "kanban-column", groupValue, index },
      collect: (monitor) => ({
        isDragging: monitor.isDragging(),
      }),
    });

    const [, drop] = useDrop<DragItem>({
      accept: "kanban-column",
      hover: (item) => {
        if (!ref.current) return;
        if (item.groupValue === groupValue) return;

        onMoveColumn(item.groupValue, groupValue);
        item.index = index;
      },
    });

    drag(drop(ref));

    // 渲染列标题
    const renderHeader = () => {
      // 对于"未分类"列，直接显示文字
      if (
        groupValue === null ||
        groupValue === undefined ||
        groupValue === ""
      ) {
        return (
          <span className="text-gray-500 dark:text-gray-400">{groupLabel}</span>
        );
      }

      // 对于有值的列，使用 SelectPlugin 的 Renderer
      const plugin = pluginManager.getPlugin(groupColumn.type);
      const Renderer = plugin?.Renderer;
      if (!Renderer) {
        return <span>{groupLabel}</span>;
      }

      return (
        <Renderer
          value={groupValue}
          column={groupColumn}
          theme={theme}
          readonly
          onCellValueChange={emptyOnCellChange}
        />
      );
    };

    return (
      <div
        ref={ref}
        style={{
          width: "300px",
          opacity: isDragging ? 0.5 : 1,
        }}
        className="flex-shrink-0 flex flex-col h-full"
      >
        {/* 列头 */}
        <div
          className={classnames("flex items-center justify-between p-3 mb-2", {
            "bg-gray-50": theme === "light",
            "bg-[#1a1a1a]": theme === "dark",
          })}
        >
          <div className="flex items-center gap-2 font-medium">
            {renderHeader()}
          </div>
          <span
            className={classnames("text-sm", {
              "text-gray-500": theme === "light",
              "text-gray-400": theme === "dark",
            })}
          >
            {rows.length}
          </span>
        </div>

        {/* 卡片列表 */}
        <div className="flex-1 overflow-y-auto px-2 space-y-2">
          {rows.map((row, idx) => (
            <KanbanCard
              key={row.id}
              row={row}
              columns={columns}
              groupColumnId={groupColumn.id}
              pluginManager={pluginManager}
              theme={theme}
              readonly={readonly}
              onClick={() => onCardClick(row)}
              onMove={onMoveCard}
              onChangeGroup={onChangeCardGroup}
              onDelete={onDeleteCard ? () => onDeleteCard(row.id) : undefined}
              index={idx}
              groupValue={groupValue}
            />
          ))}
        </div>

        {/* 添加按钮 */}
        {!readonly && (
          <div className="p-2">
            <AddCard onClick={() => onAddCard(groupValue)} theme={theme} />
          </div>
        )}
      </div>
    );
  },
);

KanbanColumn.displayName = "KanbanColumn";

export default KanbanColumn;
