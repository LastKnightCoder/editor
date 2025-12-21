import { memo, useEffect, useMemo, useState, useCallback } from "react";
import { MdDragHandle, MdClose, MdAdd } from "react-icons/md";
import classNames from "classnames";
import { ColumnDef } from "./types";
import { SortRule } from "@/types";
import ColumnIcon from "./ColumnIcon";
import PluginManager from "./PluginManager";
import SimpleDropdown from "./SimpleDropdown";

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

    const columnMenuItems = availableColumns.map((column) => ({
      key: column.id,
      label: (
        <div className="flex items-center gap-2">
          <ColumnIcon type={column.type} pluginManager={pluginManager} />
          <span>{column.title}</span>
        </div>
      ),
    }));

    const directionMenuItems = SORT_DIRECTIONS.map((direction) => ({
      key: direction.value,
      label: direction.label,
    }));

    return (
      <div className="w-[280px] flex flex-col gap-2 text-[rgba(15,23,42,0.95)] dark:text-[rgba(241,245,249,0.95)]">
        <div className="px-2 py-1 text-xs font-medium text-[rgba(15,23,42,0.55)] dark:text-[rgba(226,232,240,0.55)]">
          排序
        </div>
        {localSorts.length ? (
          <div className="flex flex-col gap-1.5">
            {localSorts.map((sort, index) => {
              const column = columns.find((col) => col.id === sort.fieldId);

              return (
                <div
                  key={sort.id}
                  className={classNames(
                    "flex items-center gap-2 px-2 py-2 rounded-[12px] bg-[rgba(255,255,255,0.4)] dark:bg-[rgba(148,163,184,0.08)]",
                    {
                      "ring-2 ring-[rgba(59,130,246,0.5)]":
                        draggingIndex === index,
                    },
                  )}
                  draggable
                  onDragStart={(event) => handleDragStart(event, index)}
                  onDragOver={handleDragOver}
                  onDrop={(event) => handleDrop(event, index)}
                  onDragEnd={handleDragEnd}
                >
                  <MdDragHandle className="text-base text-[rgba(15,23,42,0.45)] dark:text-[rgba(226,232,240,0.45)] cursor-grab" />
                  <SimpleDropdown
                    items={columnMenuItems}
                    onSelect={(key) =>
                      handleSortChange(index, { fieldId: key })
                    }
                  >
                    <div className="flex-1 flex items-center gap-2 px-2 py-1.5 rounded-[10px] bg-[rgba(255,255,255,0.6)] dark:bg-[rgba(10,15,28,0.4)] border border-transparent hover:border-[rgba(15,23,42,0.15)] dark:hover:border-[rgba(226,232,240,0.15)] cursor-pointer text-[13px]">
                      {column ? (
                        <>
                          <ColumnIcon
                            type={column.type}
                            pluginManager={pluginManager}
                          />
                          <span>{column.title || "未命名字段"}</span>
                        </>
                      ) : (
                        <span className="text-[rgba(15,23,42,0.45)] dark:text-[rgba(226,232,240,0.45)]">
                          选择字段
                        </span>
                      )}
                    </div>
                  </SimpleDropdown>
                  <SimpleDropdown
                    items={directionMenuItems}
                    onSelect={(key) =>
                      handleSortChange(index, {
                        direction: key as SortRule["direction"],
                      })
                    }
                  >
                    <div className="w-16 px-2 py-1.5 flex items-center justify-center rounded-[10px] bg-[rgba(255,255,255,0.6)] dark:bg-[rgba(10,15,28,0.4)] border border-transparent hover:border-[rgba(15,23,42,0.15)] dark:hover:border-[rgba(226,232,240,0.15)] cursor-pointer text-[13px]">
                      {
                        SORT_DIRECTIONS.find(
                          (direction) => direction.value === sort.direction,
                        )?.label
                      }
                    </div>
                  </SimpleDropdown>
                  <button
                    type="button"
                    className="border-none bg-transparent p-1 text-[rgba(15,23,42,0.45)] dark:text-[rgba(226,232,240,0.45)] hover:text-[#ff5f5a] cursor-pointer"
                    onClick={() => handleRemove(index)}
                  >
                    <MdClose className="text-base" />
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-3 py-6 text-[13px] text-center text-[rgba(15,23,42,0.45)] dark:text-[rgba(226,232,240,0.45)]">
            当前没有排序规则
          </div>
        )}

        <button
          type="button"
          className="w-full border-none bg-transparent px-3 py-2 rounded-[12px] flex items-center justify-center gap-1 text-[13px] cursor-pointer transition-all hover:bg-[rgba(255,255,255,0.6)] dark:hover:bg-[rgba(148,163,184,0.15)] disabled:opacity-40 disabled:cursor-not-allowed"
          onClick={handleAddSort}
          disabled={!availableColumns.length}
        >
          <MdAdd className="text-base" />
          <span>添加排序</span>
        </button>

        <div className="h-px bg-[rgba(15,23,42,0.1)] dark:bg-[rgba(226,232,240,0.1)] my-1" />
        <div className="flex gap-2 px-2">
          <button
            type="button"
            className="flex-1 px-3 py-1.5 rounded-[10px] text-[13px] border-none bg-transparent hover:bg-[rgba(255,255,255,0.6)] dark:hover:bg-[rgba(148,163,184,0.15)] cursor-pointer transition-all"
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="button"
            className="flex-1 px-3 py-1.5 rounded-[10px] text-[13px] border-none bg-[rgba(59,130,246,0.9)] dark:bg-[rgba(59,130,246,0.8)] text-white hover:bg-[rgba(59,130,246,1)] cursor-pointer transition-all"
            onClick={handleConfirm}
          >
            确定
          </button>
        </div>
      </div>
    );
  },
);

SortPanel.displayName = "SortPanel";

export default SortPanel;
