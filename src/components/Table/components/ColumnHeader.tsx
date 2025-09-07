import React, { memo, useMemo, useRef } from "react";
import { useMemoizedFn } from "ahooks";
import { Dropdown, App } from "antd";

import {
  useDrag,
  useDrop,
  DropTargetMonitor,
  DragSourceMonitor,
} from "react-dnd";
import { ColumnDef } from "../types";
import PluginManager from "../PluginManager";
import classNames from "classnames";
import { MoreOutlined } from "@ant-design/icons";

const COLUMN_HEADER = "columnHeader";

interface ColumnHeaderProps {
  column: ColumnDef;
  width: number;
  onResizeStart: (columnId: string, startX: number, startWidth: number) => void;
  index: number;
  moveColumn: (dragIndex: number, hoverIndex: number) => void;
  onEdit?: (columnId: string) => void; // 列编辑回调
  pluginManager?: PluginManager;
  theme: "light" | "dark";
  readonly: boolean;
  onDelete?: (columnId: string) => void;
}

interface DragItem {
  id: string;
  index: number;
  type: string;
}

const ColumnHeader: React.FC<ColumnHeaderProps> = memo(
  ({
    column,
    width,
    onResizeStart,
    index,
    moveColumn,
    onEdit,
    pluginManager,
    theme,
    readonly,
    onDelete,
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

    // 实现拖拽功能
    const [{ isDragging }, drag] = useDrag(
      () => ({
        type: COLUMN_HEADER,
        item: { id: column.id, index, type: COLUMN_HEADER },
        collect: (monitor: DragSourceMonitor) => ({
          isDragging: monitor.isDragging(),
        }),
      }),
      [column.id, index],
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
          const dragIndex = item.index;
          const hoverIndex = index;

          // 如果拖到自己上面，不做任何操作
          if (dragIndex === hoverIndex) {
            return;
          }

          // 执行移动，只要拖到其他列上就立即移动，不需要判断鼠标位置
          moveColumn(dragIndex, hoverIndex);

          // 更新item的索引以便后续操作
          item.index = hoverIndex;
        },
      }),
      [index, moveColumn],
    );

    // 将 drag 和 drop 引用函数连接到同一个元素上
    drag(drop(ref));

    // 列标题样式
    const headerStyle = {
      width: `${width}px`,
      minWidth: `${width}px`,
      maxWidth: `${width}px`,
      opacity: isDragging ? 0.5 : 1,
    };

    const moreMenuItems = useMemo(() => {
      return readonly
        ? []
        : [
            {
              key: "edit",
              label: "编辑",
              onClick: () => {
                if (readonly) return;
                onEdit?.(column.id);
              },
            },
            {
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
            },
          ];
    }, [readonly]);

    return (
      <div
        ref={ref}
        className={classNames(
          "relative p-0 box-border h-10 transition-[box-shadow,opacity,background-color,transform] duration-150 ease-linear border-r border-px border-gray-400/50",
          {
            "opacity-50 cursor-grabbing z-10": isDragging,
            "bg-[#e3f2fd]": isOver && canDrop && !isDragging,
          },
        )}
        style={headerStyle}
      >
        <div className="flex items-center px-4 py-2 h-full cursor-grab box-border">
          <div
            className="flex items-center flex-1 whitespace-nowrap overflow-hidden text-ellipsis font-semibold cursor-pointer"
            title={column.title}
          >
            <PluginIcon type={column.type} pluginManager={pluginManager} />
            <span className="text-truncate">{column.title}</span>
          </div>
          <Dropdown menu={{ items: moreMenuItems }} trigger={["hover"]}>
            <div className="w-4 h-4 text-[12px] p-1 cursor-pointer hover:bg-[var(--common-hover-bg)] rounded-full flex items-center justify-center flex-shrink-0">
              <MoreOutlined />
            </div>
          </Dropdown>
          <div
            className={classNames(
              "absolute top-0 right-[-2px] w-1 h-full cursor-col-resize bg-transparent",
              {
                "hover:bg-gray-500": isDark,
                "hover:bg-gray-200": !isDark,
              },
            )}
            onMouseDown={handleResizeStart}
          />
        </div>
      </div>
    );
  },
);

export default ColumnHeader;

function PluginIcon({
  type,
  pluginManager,
}: {
  type: string;
  pluginManager?: PluginManager;
}) {
  const plugin = pluginManager?.getPlugin(type);
  const Icon = plugin?.Icon;
  if (!Icon)
    return (
      <span className="inline-flex items-center justify-center mr-1.5 text-[#666]"></span>
    );
  return (
    <span className="inline-flex items-center justify-center mr-1.5 text-[#666]">
      <Icon />
    </span>
  );
}
