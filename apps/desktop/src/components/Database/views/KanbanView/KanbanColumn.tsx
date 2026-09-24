import React, { memo, useRef } from "react";
import { useDrag, useDrop } from "react-dnd";
import { useVirtualizer } from "@tanstack/react-virtual";
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
  onAddCard?: (groupValue: CellValue) => void;
  onMoveCard?: (dragRowId: string, hoverRowId: string) => void;
  onChangeCardGroup: (rowId: string, newGroupValue: CellValue) => void;
  onToggleDone: (rowId: string, checked: boolean) => void;
  onMoveColumn: (dragGroupValue: CellValue, hoverGroupValue: CellValue) => void;
  onDeleteCard?: (rowId: string) => void;
  doneColumnId?: string;
  visibleFieldIds: string[];
  showFieldLabels: boolean;
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
    onToggleDone,
    onMoveColumn,
    onDeleteCard,
    doneColumnId,
    visibleFieldIds,
    showFieldLabels,
    index,
  }) => {
    const ref = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const [{ isDragging }, drag] = useDrag({
      type: "kanban-column",
      item: { type: "kanban-column", groupValue, index },
      canDrag: () => !readonly,
      collect: monitor => ({
        isDragging: monitor.isDragging(),
      }),
    });

    const [, drop] = useDrop<DragItem>({
      accept: "kanban-column",
      hover: item => {
        if (!ref.current || readonly) return;
        if (item.groupValue === groupValue) return;

        onMoveColumn(item.groupValue, groupValue);
        item.index = index;
      },
    });

    drag(drop(ref));

    // 虚拟滚动
    const virtualizer = useVirtualizer({
      count: rows.length,
      getScrollElement: () => scrollContainerRef.current,
      estimateSize: () => 120, // 预估卡片高度 + 间距
      overscan: 5,
      // 支持动态高度测量
      measureElement: el => {
        const card = el.firstElementChild;
        if (!card) return 120; // 默认高度
        // 包括元素自身高度和间距（space-y-2 = 8px）
        return card.getBoundingClientRect().height + 8;
      },
      getItemKey: index => rows[index]?.id || index,
    });

    // 渲染列标题
    const renderHeader = () => {
      // 对于"未分类"列，直接显示文字
      if (groupValue === null || groupValue === undefined || groupValue === "") {
        return <span className="text-ink-2">{groupLabel}</span>;
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
          width: "308px",
          opacity: isDragging ? 0.5 : 1,
        }}
        className="flex h-full shrink-0 flex-col px-2"
      >
        {/* 列头 */}
        <div className="mb-1 flex items-center justify-between px-2 py-2">
          <div className="text-ink-1 flex items-center gap-2 font-medium">{renderHeader()}</div>
          <span className="text-ink-3 text-tau-sm px-1 tabular-nums">{rows.length}</span>
        </div>

        {/* 卡片列表 */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-1">
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {virtualizer.getVirtualItems().map(virtualItem => {
              const row = rows[virtualItem.index];
              return (
                <div
                  key={virtualItem.key}
                  data-index={virtualItem.index}
                  ref={virtualizer.measureElement}
                  className="pt-2"
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  <KanbanCard
                    row={row}
                    columns={columns}
                    pluginManager={pluginManager}
                    theme={theme}
                    readonly={readonly}
                    onClick={() => onCardClick(row)}
                    onMove={onMoveCard}
                    onChangeGroup={onChangeCardGroup}
                    onToggleDone={onToggleDone}
                    onDelete={onDeleteCard ? () => onDeleteCard(row.id) : undefined}
                    doneColumnId={doneColumnId}
                    visibleFieldIds={visibleFieldIds}
                    showFieldLabels={showFieldLabels}
                    index={virtualItem.index}
                    groupValue={groupValue}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* 添加按钮 */}
        {!readonly && onAddCard && (
          <div className="p-2">
            <AddCard onClick={() => onAddCard(groupValue)} theme={theme} />
          </div>
        )}
      </div>
    );
  }
);

KanbanColumn.displayName = "KanbanColumn";

export default KanbanColumn;
