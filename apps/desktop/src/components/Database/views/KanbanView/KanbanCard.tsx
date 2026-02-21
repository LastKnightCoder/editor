import React, { memo, useMemo, useRef, useState } from "react";
import { useDrag, useDrop } from "react-dnd";
import classnames from "classnames";
import { MdDelete } from "react-icons/md";
import { RowData, ColumnDef, CellValue } from "../../types";
import PluginManager from "../../PluginManager";
import useThemeColors from "@/hooks/useThemeColors";

interface KanbanCardProps {
  row: RowData;
  columns: ColumnDef[];
  pluginManager: PluginManager;
  theme: "light" | "dark";
  readonly?: boolean;
  onClick: () => void;
  onMove: (dragRowId: string, hoverRowId: string) => void;
  onChangeGroup: (rowId: string, newGroupValue: CellValue) => void;
  onToggleDone: (rowId: string, checked: boolean) => void;
  onDelete?: () => void;
  doneColumnId?: string;
  visibleFieldIds: string[];
  showFieldLabels: boolean;
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

const isEmptyFieldValue = (value: CellValue) => {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
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
    onToggleDone,
    onDelete,
    doneColumnId,
    visibleFieldIds,
    showFieldLabels,
    index,
    groupValue,
  }) => {
    const ref = useRef<HTMLDivElement>(null);
    const [isHovered, setIsHovered] = useState(false);
    const themeColors = useThemeColors();

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

    const columnMap = useMemo(
      () => new Map(columns.map((column) => [column.id, column])),
      [columns],
    );
    const primaryColumn = useMemo(
      () => columns.find((column) => column.isPrimary),
      [columns],
    );
    const doneColumn = useMemo(
      () =>
        doneColumnId && columnMap.get(doneColumnId)?.type === "checkbox"
          ? columnMap.get(doneColumnId)
          : undefined,
      [columnMap, doneColumnId],
    );
    const fieldColumns = useMemo(
      () =>
        visibleFieldIds
          .map((columnId) => columnMap.get(columnId))
          .filter((column): column is ColumnDef => !!column),
      [columnMap, visibleFieldIds],
    );

    return (
      <div
        ref={ref}
        onClick={onClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{ opacity: isDragging ? 0.5 : 1 }}
        className={classnames(
          "group p-3 rounded-xl cursor-pointer transition-all border relative shadow-sm hover:shadow-md hover:-translate-y-[1px]",
          themeColors.cardBgClass,
          themeColors.hoverClass,
          "border-black/6 dark:border-white/8",
        )}
      >
        {!readonly && onDelete && isHovered && (
          <div
            className="absolute top-2 right-2 z-20 w-6 h-6 rounded-md flex items-center justify-center cursor-pointer transition-colors text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <MdDelete className="w-4 h-4" />
          </div>
        )}
        <div className="space-y-2">
          {primaryColumn &&
            (() => {
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

          {(doneColumn ||
            fieldColumns.some((col) => !isEmptyFieldValue(row[col.id]))) && (
            <div className="border-t border-black/6 dark:border-white/8 pt-2 space-y-1.5">
              {doneColumn && (
                <div
                  className="flex items-center gap-2"
                  onClick={(event) => {
                    event.stopPropagation();
                  }}
                >
                  {showFieldLabels && (
                    <span
                      className={classnames(
                        "text-[11px] shrink-0",
                        themeColors.secondaryTextClass,
                      )}
                    >
                      {doneColumn.title}
                    </span>
                  )}
                  {(() => {
                    const plugin = pluginManager.getPlugin(doneColumn.type);
                    const Renderer = plugin?.Renderer;
                    if (!Renderer) return null;
                    return (
                      <div className="min-h-5 min-w-0">
                        <Renderer
                          value={row[doneColumn.id]}
                          column={doneColumn}
                          theme={theme}
                          readonly={Boolean(readonly)}
                          onCellValueChange={(newValue) =>
                            onToggleDone(row.id, Boolean(newValue))
                          }
                        />
                      </div>
                    );
                  })()}
                </div>
              )}

              {fieldColumns.map((column) => {
                const value = row[column.id];
                if (isEmptyFieldValue(value)) return null;

                const plugin = pluginManager.getPlugin(column.type);
                const Renderer = plugin?.Renderer;
                if (!Renderer) return null;

                return (
                  <div key={column.id} className="flex items-start gap-2">
                    {showFieldLabels && (
                      <span
                        className={classnames(
                          "text-[11px] shrink-0 pt-0.5",
                          themeColors.secondaryTextClass,
                        )}
                      >
                        {column.title}
                      </span>
                    )}
                    <div className="min-h-5 min-w-0 flex-1">
                      <Renderer
                        value={value}
                        column={column}
                        theme={theme}
                        readonly
                        onCellValueChange={emptyOnCellChange}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  },
);

KanbanCard.displayName = "KanbanCard";

export default KanbanCard;
