import { memo, useEffect, useMemo, useState, useCallback } from "react";
import { GripVertical, Plus, X } from "lucide-react";
import classNames from "classnames";
import { ColumnDef } from "./types";
import { SortRule } from "@/types";
import ColumnIcon from "./ColumnIcon";
import PluginManager from "./PluginManager";
import SimpleDropdown from "./SimpleDropdown";
import { Button } from "@tau/ui/Button";

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
      return columns.filter(column => {
        if (!column.id) return false;
        const plugin = pluginManager.getPlugin(column.type);
        return Boolean(plugin?.sort);
      });
    }, [columns, pluginManager]);

    const handleSortChange = (index: number, updates: Partial<SortRule>) => {
      setLocalSorts(prev => {
        const next = [...prev];
        next[index] = { ...next[index], ...updates };
        return next;
      });
    };

    const handleAddSort = () => {
      const nextPriority = localSorts.length
        ? Math.max(...localSorts.map(item => item.priority)) + 1
        : 0;
      const firstColumnId = availableColumns[0]?.id;

      if (!firstColumnId) return;

      const newRule: SortRule = {
        id: `sort-${Date.now()}`,
        fieldId: firstColumnId,
        direction: "asc",
        priority: nextPriority,
      };

      setLocalSorts(prev => [...prev, newRule]);
    };

    const handleRemove = (index: number) => {
      setLocalSorts(prev => prev.filter((_, i) => i !== index));
    };

    const handleDragStart = useCallback((event: React.DragEvent<HTMLDivElement>, index: number) => {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", String(index));
      setDraggingIndex(index);
    }, []);

    const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    }, []);

    const handleDrop = useCallback(
      (event: React.DragEvent<HTMLDivElement>, targetIndex: number) => {
        event.preventDefault();
        const fromIndex = Number(event.dataTransfer.getData("text/plain"));
        if (Number.isNaN(fromIndex) || fromIndex === targetIndex) {
          setDraggingIndex(null);
          return;
        }
        setLocalSorts(prev => {
          const next = [...prev];
          const [moved] = next.splice(fromIndex, 1);
          next.splice(targetIndex, 0, moved);
          return next;
        });
        setDraggingIndex(null);
      },
      []
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
        .filter(sort => sort.fieldId);
      onChange(normalized);
      onClose?.();
    };

    const columnMenuItems = availableColumns.map(column => ({
      key: column.id,
      label: (
        <div className="flex items-center gap-2">
          <ColumnIcon type={column.type} pluginManager={pluginManager} />
          <span>{column.title}</span>
        </div>
      ),
    }));

    const directionMenuItems = SORT_DIRECTIONS.map(direction => ({
      key: direction.value,
      label: direction.label,
    }));

    return (
      <div className="text-ink-1 flex w-[280px] flex-col gap-2 py-1">
        <div className="text-tau-micro text-ink-2 px-2.5 py-1 font-medium">排序</div>
        {localSorts.length ? (
          <div className="flex flex-col gap-1.5 px-2">
            {localSorts.map((sort, index) => {
              const column = columns.find(col => col.id === sort.fieldId);

              return (
                <div
                  key={sort.id}
                  className={classNames(
                    "bg-page rounded-tau-md flex items-center gap-2 px-2 py-2",
                    {
                      "ring-accent/60 ring-2": draggingIndex === index,
                    }
                  )}
                  draggable
                  onDragStart={event => handleDragStart(event, index)}
                  onDragOver={handleDragOver}
                  onDrop={event => handleDrop(event, index)}
                  onDragEnd={handleDragEnd}
                >
                  <GripVertical
                    className="text-ink-3 size-4 shrink-0 cursor-grab"
                    strokeWidth={1.75}
                  />
                  <SimpleDropdown
                    items={columnMenuItems}
                    onSelect={key => handleSortChange(index, { fieldId: key })}
                  >
                    <div className="rounded-tau-sm bg-surface border-line-1 hover:border-ink-3 text-tau-sm flex flex-1 cursor-pointer items-center gap-2 border px-2 py-1.5 transition-colors">
                      {column ? (
                        <>
                          <ColumnIcon type={column.type} pluginManager={pluginManager} />
                          <span className="truncate">{column.title || "未命名字段"}</span>
                        </>
                      ) : (
                        <span className="text-ink-3">选择字段</span>
                      )}
                    </div>
                  </SimpleDropdown>
                  <SimpleDropdown
                    items={directionMenuItems}
                    onSelect={key =>
                      handleSortChange(index, {
                        direction: key as SortRule["direction"],
                      })
                    }
                  >
                    <div className="rounded-tau-sm bg-surface border-line-1 hover:border-ink-3 text-tau-sm flex w-16 cursor-pointer items-center justify-center border px-2 py-1.5 transition-colors">
                      {SORT_DIRECTIONS.find(direction => direction.value === sort.direction)?.label}
                    </div>
                  </SimpleDropdown>
                  <button
                    type="button"
                    className="text-ink-3 hover:text-danger cursor-pointer border-none bg-transparent p-1"
                    onClick={() => handleRemove(index)}
                  >
                    <X className="size-4" strokeWidth={1.75} />
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-tau-body text-ink-3 px-3 py-6 text-center">当前没有排序规则</div>
        )}

        <button
          type="button"
          className="text-ink-2 hover:bg-hover hover:text-ink-1 rounded-tau-sm text-tau-sm ease-tau-out flex w-full cursor-pointer items-center justify-center gap-1 border-none bg-transparent px-3 py-2 transition-colors duration-[160ms] disabled:cursor-not-allowed disabled:opacity-40"
          onClick={handleAddSort}
          disabled={!availableColumns.length}
        >
          <Plus className="size-4" strokeWidth={1.75} />
          <span>添加排序</span>
        </button>

        <div className="text-tau-body flex gap-2 px-2.5 pt-1.5">
          <Button variant="ghost" size="sm" block onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" size="sm" block onClick={handleConfirm}>
            确定
          </Button>
        </div>
      </div>
    );
  }
);

SortPanel.displayName = "SortPanel";

export default SortPanel;
