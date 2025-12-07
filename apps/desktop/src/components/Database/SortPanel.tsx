import { memo, useEffect, useMemo, useState, useCallback } from "react";
import { Button, Dropdown } from "antd";
import type { MenuProps } from "antd";
import { MdDragHandle, MdClose, MdAdd } from "react-icons/md";
import classNames from "classnames";
import { ColumnDef } from "./types";
import { SortRule } from "@/types";
import ColumnIcon from "./ColumnIcon";
import PluginManager from "./PluginManager";

interface SortPanelProps {
  columns: ColumnDef[];
  sorts: SortRule[];
  onChange: (sorts: SortRule[]) => void;
  onClose?: () => void;
  pluginManager: PluginManager;
}

const SORT_DIRECTIONS: { value: SortRule["direction"]; label: string }[] = [
  { value: "asc", label: "升序" },
  { value: "desc", label: "降序" },
];

const SortPanel: React.FC<SortPanelProps> = memo(
  ({ columns, sorts, onChange, onClose, pluginManager }) => {
    const sortedSorts = useMemo(() => {
      return [...sorts].sort((a, b) => a.priority - b.priority);
    }, [sorts]);

    const [localSorts, setLocalSorts] = useState<SortRule[]>(sortedSorts);
    const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

    useEffect(() => {
      setLocalSorts(sortedSorts);
    }, [sortedSorts]);

    const availableColumns = useMemo(() => {
      return columns.filter((column) => {
        if (!column.id) return false;
        const plugin = pluginManager.getPlugin(column.type);
        return Boolean(plugin?.sort);
      });
    }, [columns, pluginManager]);

    const handleSortChange = (index: number, updates: Partial<SortRule>) => {
      setLocalSorts((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], ...updates };
        return next;
      });
    };

    const handleAddSort = () => {
      const nextPriority = localSorts.length
        ? Math.max(...localSorts.map((item) => item.priority)) + 1
        : 0;
      const firstColumnId = availableColumns[0]?.id;

      if (!firstColumnId) return;

      const newRule: SortRule = {
        id: `sort-${Date.now()}`,
        fieldId: firstColumnId,
        direction: "asc",
        priority: nextPriority,
      };

      setLocalSorts((prev) => [...prev, newRule]);
    };

    const handleRemove = (index: number) => {
      setLocalSorts((prev) => prev.filter((_, i) => i !== index));
    };

    const handleDragStart = useCallback(
      (event: React.DragEvent<HTMLDivElement>, index: number) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", String(index));
        setDraggingIndex(index);
      },
      [],
    );

    const handleDragOver = useCallback(
      (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      },
      [],
    );

    const handleDrop = useCallback(
      (event: React.DragEvent<HTMLDivElement>, targetIndex: number) => {
        event.preventDefault();
        const fromIndex = Number(event.dataTransfer.getData("text/plain"));
        if (Number.isNaN(fromIndex) || fromIndex === targetIndex) {
          setDraggingIndex(null);
          return;
        }
        setLocalSorts((prev) => {
          const next = [...prev];
          const [moved] = next.splice(fromIndex, 1);
          next.splice(targetIndex, 0, moved);
          return next;
        });
        setDraggingIndex(null);
      },
      [],
    );

    const handleDragEnd = useCallback(() => {
      setDraggingIndex(null);
    }, []);

    const handleConfirm = () => {
      const normalized = localSorts
        .map((sort, index) => ({
          ...sort,
          priority: index,
        }))
        .filter((sort) => sort.fieldId);
      onChange(normalized);
      onClose?.();
    };

    const handleCancel = () => {
      setLocalSorts(sortedSorts);
      onClose?.();
    };

    const columnMenuItems: MenuProps["items"] = availableColumns.map(
      (column) => ({
        key: column.id,
        label: (
          <div className="flex items-center gap-2 text-sm">
            <ColumnIcon type={column.type} pluginManager={pluginManager} />
            <span>{column.title}</span>
          </div>
        ),
      }),
    );

    const directionMenuItems: MenuProps["items"] = SORT_DIRECTIONS.map(
      (direction) => ({
        key: direction.value,
        label: direction.label,
      }),
    );

    return (
      <div
        className="w-[260px] flex flex-col gap-3 text-[#2C2C2C] dark:text-[#FFFFFF]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="text-base font-semibold">排序</div>
        {localSorts.length ? (
          <div className="flex flex-col gap-2">
            {localSorts.map((sort, index) => {
              const column = columns.find((col) => col.id === sort.fieldId);

              return (
                <div
                  key={sort.id}
                  className={classNames(
                    "flex items-center gap-2 px-3 py-2 rounded-lg bg-[#F5F5F5] dark:bg-[#2C2C2C]",
                    {
                      "ring-2 ring-[#5D9CFF]": draggingIndex === index,
                    },
                  )}
                  draggable
                  onDragStart={(event) => handleDragStart(event, index)}
                  onDragOver={handleDragOver}
                  onDrop={(event) => handleDrop(event, index)}
                  onDragEnd={handleDragEnd}
                >
                  <MdDragHandle className="text-lg text-[#807D78]" />
                  <Dropdown
                    trigger={["click"]}
                    menu={{
                      items: columnMenuItems,
                      onClick: ({ key }) =>
                        handleSortChange(index, {
                          fieldId: key,
                        }),
                    }}
                  >
                    <div className="flex-1 flex items-center gap-2 h-9 px-3 rounded-md bg-white dark:bg-[#1E1E1E] border border-transparent hover:border-[#D6D6D6] cursor-pointer">
                      {column ? (
                        <>
                          <ColumnIcon
                            type={column.type}
                            pluginManager={pluginManager}
                          />
                          <span className="text-sm">
                            {column.title || "未命名字段"}
                          </span>
                        </>
                      ) : (
                        <span className="text-sm text-[#807D78]">选择字段</span>
                      )}
                    </div>
                  </Dropdown>
                  <Dropdown
                    trigger={["click"]}
                    menu={{
                      items: directionMenuItems,
                      onClick: ({ key }) =>
                        handleSortChange(index, {
                          direction: key as SortRule["direction"],
                        }),
                    }}
                  >
                    <div className="w-20 h-9 flex items-center justify-center rounded-md bg-white dark:bg-[#1E1E1E] border border-transparent hover:border-[#D6D6D6] cursor-pointer text-sm">
                      {
                        SORT_DIRECTIONS.find(
                          (direction) => direction.value === sort.direction,
                        )?.label
                      }
                    </div>
                  </Dropdown>
                  <MdClose
                    className="text-[#807D78] cursor-pointer"
                    onClick={() => handleRemove(index)}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-sm text-[#807D78] dark:text-[#A5A199]">
            当前没有排序规则
          </div>
        )}

        <div>
          <Button
            type="text"
            icon={<MdAdd />}
            onClick={handleAddSort}
            disabled={!availableColumns.length}
          >
            添加排序
          </Button>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button onClick={handleCancel}>取消</Button>
          <Button type="primary" onClick={handleConfirm}>
            确定
          </Button>
        </div>
      </div>
    );
  },
);

SortPanel.displayName = "SortPanel";

export default SortPanel;
