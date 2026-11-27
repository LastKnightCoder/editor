import React, { memo, useRef, useState } from "react";
import { useMemoizedFn } from "ahooks";
import { MoreHorizontal } from "lucide-react";
import { Menu, ConfirmDialog } from "@tau/ui";

import { useDrag, useDrop, DropTargetMonitor, DragSourceMonitor } from "react-dnd";
import { ColumnDef } from "../../../types";
import type { DatabaseCommandsRuntime } from "../../../commands";
import { visibleCommands } from "../../../commands";
import PluginManager from "../../../PluginManager";
import CommandMenuItems from "../../../components/CommandMenuItems";
import classNames from "classnames";
import ColumnIcon from "../../../ColumnIcon";
import { useDatabaseI18n } from "../../../i18n";

const COLUMN_HEADER = "columnHeader";

interface ColumnHeaderProps {
  column: ColumnDef;
  width: number;
  onResizeStart: (columnId: string, startX: number, startWidth: number) => void;
  moveColumn: (columnId: string, targetId: string) => void;
  onEdit?: (columnId: string) => void; // 列编辑回调
  pluginManager?: PluginManager;
  theme: "light" | "dark";
  readonly: boolean;
  onDelete?: (columnId: string) => void;
  allowDeleteColumn?: boolean; // 是否允许删除列，默认 true
  /** 扩展命令运行时；扩展项排在「编辑」之后、「删除」之前，与内置项之间有分隔线 */
  commands?: DatabaseCommandsRuntime;
}

interface DragItem {
  id: string;
  type: string;
}

const ColumnHeader: React.FC<ColumnHeaderProps> = memo(
  ({
    column,
    width,
    onResizeStart,
    moveColumn,
    onEdit,
    pluginManager,
    readonly,
    onDelete,
    allowDeleteColumn = true,
    commands,
  }) => {
    const ref = useRef<HTMLDivElement>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const { t } = useDatabaseI18n();

    const handleResizeStart = useMemoizedFn((e: React.MouseEvent) => {
      if (readonly) return;
      e.preventDefault();
      e.stopPropagation();
      onResizeStart(column.id, e.clientX, width);
    });

    const onDoubleClick = useMemoizedFn((e: React.MouseEvent) => {
      if (readonly) return;
      e.preventDefault();
      e.stopPropagation();
      onEdit?.(column.id);
    });

    // 实现拖拽功能
    const [{ isDragging }, drag] = useDrag(
      () => ({
        type: COLUMN_HEADER,
        item: { id: column.id, type: COLUMN_HEADER },
        canDrag: () => {
          return !readonly;
        },
        collect: (monitor: DragSourceMonitor) => {
          const dragging = monitor.isDragging();
          return { isDragging: dragging };
        },
      }),
      [column.id, column.title, readonly]
    );

    // 实现拖放目标功能
    const [{ isOver, canDrop }, drop] = useDrop(
      () => ({
        accept: COLUMN_HEADER,
        collect: (monitor: DropTargetMonitor) => ({
          isOver: monitor.isOver(),
          canDrop: monitor.canDrop(),
        }),
        hover: (item: DragItem) => {
          if (!ref.current || readonly) {
            return;
          }
          // 如果拖到自己上面，不做任何操作
          if (item.id === column.id) {
            return;
          }

          // 只要拖到其他列上就立即移动，无需判断鼠标位置
          moveColumn(item.id, column.id);
        },
      }),
      [column.id, moveColumn, readonly]
    );

    drag(drop(ref));

    const columnCommands = commands
      ? visibleCommands(commands.definitions, "column", {
          api: commands.api,
          columnId: column.id,
        })
      : [];
    const showDelete = !column.isPrimary && allowDeleteColumn;

    // 列标题样式
    const headerStyle = {
      width: `${width}px`,
      minWidth: `${width}px`,
      maxWidth: `${width}px`,
      opacity: isDragging ? 0.5 : 1,
    };

    return (
      <div
        ref={ref}
        className={classNames(
          "border-line-2 relative box-border h-10 border-r p-0 transition-[box-shadow,opacity,background-color,transform] duration-150 ease-linear",
          {
            "z-10 cursor-grabbing opacity-50": isDragging,
            "bg-accent-soft": isOver && canDrop && !isDragging,
          }
        )}
        onDoubleClick={onDoubleClick}
        style={headerStyle}
      >
        <div className="box-border flex h-full cursor-grab items-center px-2 py-2">
          <div
            className="flex h-full flex-1 cursor-pointer items-center overflow-hidden font-medium whitespace-nowrap"
            title={column.title}
          >
            <ColumnIcon type={column.type} pluginManager={pluginManager} />
            <span className="text-tau-sm text-ink-2 flex h-full items-center truncate">
              {column.title}
            </span>
          </div>
          {!readonly && !column.readonly && (
            <Menu
              align="end"
              trigger={
                <button
                  type="button"
                  title={t("table.columnActions")}
                  className="text-ink-3 hover:bg-hover hover:text-ink-1 grid h-4 w-4 shrink-0 cursor-pointer place-items-center rounded-full"
                  onClick={e => e.stopPropagation()}
                >
                  <MoreHorizontal className="size-[14px]" strokeWidth={1.75} />
                </button>
              }
            >
              <Menu.Item
                onSelect={() => {
                  if (readonly) return;
                  onEdit?.(column.id);
                }}
              >
                {t("common.edit")}
              </Menu.Item>
              {columnCommands.length > 0 && commands && (
                <>
                  <Menu.Separator />
                  <CommandMenuItems
                    items={columnCommands}
                    api={commands.api}
                    columnId={column.id}
                  />
                  {showDelete && <Menu.Separator />}
                </>
              )}
              {showDelete && (
                <Menu.Item
                  danger
                  onSelect={() => {
                    if (readonly) return;
                    setConfirmDelete(true);
                  }}
                >
                  {t("common.delete")}
                </Menu.Item>
              )}
            </Menu>
          )}
          <div
            className="hover:bg-hover absolute top-0 right-[-2px] h-full w-1 cursor-col-resize bg-transparent"
            onMouseDown={handleResizeStart}
          />
          <ConfirmDialog
            open={confirmDelete}
            onOpenChange={setConfirmDelete}
            title={t("table.columnDeleteTitle")}
            context={column.title}
            impact={t("table.columnDeleteImpact")}
            danger
            confirmText={t("common.confirm")}
            onConfirm={() => onDelete?.(column.id)}
          />
        </div>
      </div>
    );
  }
);

export default ColumnHeader;
