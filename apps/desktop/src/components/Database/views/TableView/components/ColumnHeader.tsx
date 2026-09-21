import React, { memo, useMemo, useRef } from "react";
import { useMemoizedFn } from "ahooks";
import { Dropdown, App } from "antd";

import { useDrag, useDrop, DropTargetMonitor, DragSourceMonitor } from "react-dnd";
import { ColumnDef } from "../../../types";
import PluginManager from "../../../PluginManager";
import classNames from "classnames";
import { MoreOutlined } from "@ant-design/icons";
import ColumnIcon from "../../../ColumnIcon";

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
    theme,
    readonly,
    onDelete,
    allowDeleteColumn = true,
  }) => {
    const ref = useRef<HTMLDivElement>(null);
    const isDark = theme === "dark";

    const { modal } = App.useApp();

    // 处理调整大小开始
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

          // 执行移动，只要拖到其他列上就立即移动，不需要判断鼠标位置
          moveColumn(item.id, column.id);
        },
      }),
      [column.id, moveColumn, readonly]
    );

    drag(drop(ref));

    // 列标题样式
    const headerStyle = {
      width: `${width}px`,
      minWidth: `${width}px`,
      maxWidth: `${width}px`,
      opacity: isDragging ? 0.5 : 1,
    };

    const moreMenuItems = useMemo(() => {
      if (readonly) return [];

      const items = [
        {
          key: "edit",
          label: "编辑",
          onClick: () => {
            if (readonly) return;
            onEdit?.(column.id);
          },
        },
      ];

      // 主列不显示删除选项，或者如果不允许删除列，则不显示
      if (!column.isPrimary && allowDeleteColumn) {
        items.push({
          key: "delete",
          label: "删除",
          onClick: () => {
            if (readonly) return;
            modal.confirm({
              title: "确认删除",
              content: "确定要删除这条列吗？",
              okText: "确认",
              okButtonProps: {
                danger: true,
              },
              onOk: () => onDelete?.(column.id),
            });
          },
        });
      }

      return items;
    }, [readonly, column.id, column.isPrimary, allowDeleteColumn, onEdit, onDelete, modal]);

    return (
      <div
        ref={ref}
        className={classNames(
          "border-px relative box-border h-10 border-r p-0 transition-[box-shadow,opacity,background-color,transform] duration-150 ease-linear",
          {
            "border-gray-400/50": theme === "light",
            "border-white/10": theme === "dark",
          },
          {
            "z-10 cursor-grabbing opacity-50": isDragging,
            "bg-[#e3f2fd]": isOver && canDrop && !isDragging,
          }
        )}
        onDoubleClick={onDoubleClick}
        style={headerStyle}
      >
        <div className="box-border flex h-full cursor-grab items-center px-2 py-2">
          <div
            className="flex h-full flex-1 cursor-pointer items-center overflow-hidden whitespace-nowrap font-semibold"
            title={column.title}
          >
            <ColumnIcon type={column.type} pluginManager={pluginManager} />
            <span className="text-truncate flex h-full items-center text-sm">{column.title}</span>
          </div>
          {!readonly && !column.readonly && (
            <Dropdown menu={{ items: moreMenuItems }} trigger={["hover"]}>
              <div className="hover:bg-(--th-bg-hover) flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-full p-1 text-[12px]">
                <MoreOutlined />
              </div>
            </Dropdown>
          )}
          <div
            className={classNames(
              "absolute right-[-2px] top-0 h-full w-1 cursor-col-resize bg-transparent",
              {
                "hover:bg-gray-500": isDark,
                "hover:bg-gray-200": !isDark,
              }
            )}
            onMouseDown={handleResizeStart}
          />
        </div>
      </div>
    );
  }
);

export default ColumnHeader;
