import { memo, useEffect, useMemo, useState, useCallback } from "react";
import { ArrowDown, ArrowUp, ChevronDown, GripVertical, Plus, X } from "lucide-react";
import { cn, Button } from "@tau/ui";
import { ColumnDef } from "./types";
import { SortRule } from "./types";
import type { ValueType } from "./core/formula/types";
import ColumnIcon from "./ColumnIcon";
import PluginManager from "./PluginManager";
import SimpleDropdown from "./SimpleDropdown";
import { useDatabaseI18n } from "./i18n";

interface SortPanelProps {
  columns: ColumnDef[];
  sorts: SortRule[];
  onChange: (sorts: SortRule[]) => void;
  onClose?: () => void;
  pluginManager: PluginManager;
}

/** 方向的人话提示：按字段值类型 + 方向映射，消除「升序是哪边」的歧义；公式列按结果类型推导 */
const directionHint = (
  t: ReturnType<typeof useDatabaseI18n>["t"],
  valueType: ValueType | null,
  direction: SortRule["direction"]
): string => {
  if (valueType === "date")
    return direction === "asc" ? t("sort.dir.oldToNew") : t("sort.dir.newToOld");
  if (valueType === "number") return direction === "asc" ? "0→9" : "9→0";
  return direction === "asc" ? "A→Z" : "Z→A";
};

const SortPanel: React.FC<SortPanelProps> = memo(
  ({ columns, sorts, onChange, onClose, pluginManager }) => {
    const { t } = useDatabaseI18n();
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

    const handleClearAll = () => {
      setLocalSorts([]);
    };

    /** 空态推荐：优先日期列（更新时间/创建时间天然高频），点 ＋ 直接补一条规则 */
    const suggestColumns = useMemo(
      () =>
        availableColumns
          .filter(column => pluginManager.hasCapability(column.type, "date"))
          .slice(0, 2),
      [availableColumns, pluginManager]
    );

    const appendRule = (fieldId: string) => {
      const nextPriority = localSorts.length
        ? Math.max(...localSorts.map(item => item.priority)) + 1
        : 0;
      setLocalSorts(prev => [
        ...prev,
        { id: `sort-${Date.now()}`, fieldId, direction: "desc", priority: nextPriority },
      ]);
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

    return (
      <div className="text-ink-1 flex w-[300px] flex-col gap-2 p-2.5">
        <div className="flex items-baseline gap-2 px-1">
          <span className="text-tau-meta text-ink-1 font-semibold">{t("sort.title")}</span>
          {localSorts.length > 0 && (
            <span className="text-tau-micro text-ink-3">{t("sort.subtitle")}</span>
          )}
        </div>
        {localSorts.length ? (
          <div className="flex flex-col gap-0.5 px-0.5">
            {localSorts.map((sort, index) => {
              const column = columns.find(col => col.id === sort.fieldId);

              return (
                <div
                  key={sort.id}
                  className={cn(
                    "group/srow hover:bg-hover ease-tau-out rounded-tau-sm flex items-center gap-1.5 px-1 py-1 transition-colors duration-[160ms]",
                    {
                      "bg-surface ring-accent/60 ring-2": draggingIndex === index,
                    }
                  )}
                  draggable
                  onDragStart={event => handleDragStart(event, index)}
                  onDragOver={handleDragOver}
                  onDrop={event => handleDrop(event, index)}
                  onDragEnd={handleDragEnd}
                >
                  <span
                    className="bg-hover text-ink-2 grid size-4 shrink-0 place-items-center rounded-full text-[10px] font-bold tabular-nums"
                    title={t("sort.priorityTitle", { index: index + 1 })}
                  >
                    {index + 1}
                  </span>
                  <GripVertical
                    className="text-ink-3 size-3.5 shrink-0 cursor-grab opacity-40 transition-opacity group-hover/srow:opacity-80"
                    strokeWidth={1.75}
                  />
                  <SimpleDropdown
                    items={columnMenuItems}
                    onSelect={key => handleSortChange(index, { fieldId: key })}
                    className="min-w-0 flex-1"
                  >
                    <div className="text-ink-1 hover:bg-surface-hover text-tau-sm flex h-7 min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-[7px] px-2 transition-colors">
                      {column ? (
                        <>
                          <ColumnIcon type={column.type} pluginManager={pluginManager} />
                          <span className="truncate">
                            {column.title || t("sort.unnamedColumn")}
                          </span>
                        </>
                      ) : (
                        <span className="text-ink-3">{t("sort.selectField")}</span>
                      )}
                      <ChevronDown
                        className="text-ink-3 ml-auto size-3 shrink-0 opacity-60"
                        strokeWidth={2.25}
                      />
                    </div>
                  </SimpleDropdown>
                  <button
                    type="button"
                    aria-label={t("sort.toggleDirection")}
                    title={t("sort.directionTitle", {
                      current:
                        sort.direction === "asc" ? t("sort.directionAsc") : t("sort.directionDesc"),
                      next:
                        sort.direction === "asc" ? t("sort.directionDesc") : t("sort.directionAsc"),
                    })}
                    onClick={() =>
                      handleSortChange(index, {
                        direction: sort.direction === "asc" ? "desc" : "asc",
                      })
                    }
                    className="text-ink-2 hover:bg-surface-hover relative grid size-[26px] shrink-0 cursor-pointer place-items-center rounded-[7px] transition-colors"
                  >
                    {sort.direction === "asc" ? (
                      <ArrowUp className="size-3.5" strokeWidth={2} />
                    ) : (
                      <ArrowDown className="size-3.5" strokeWidth={2} />
                    )}
                    {sort.direction === "asc" ? (
                      <ArrowDown
                        className="absolute right-[5px] bottom-[4px] size-[7px] opacity-45"
                        strokeWidth={3}
                      />
                    ) : (
                      <ArrowUp
                        className="absolute right-[5px] bottom-[4px] size-[7px] opacity-45"
                        strokeWidth={3}
                      />
                    )}
                  </button>
                  <span className="text-ink-3 w-[38px] shrink-0 text-right text-[10.5px] tabular-nums">
                    {column
                      ? directionHint(t, pluginManager.getValueType(column) ?? null, sort.direction)
                      : ""}
                  </span>
                  <button
                    type="button"
                    aria-label={t("sort.removeRule")}
                    className="text-ink-3 hover:bg-danger-soft hover:text-danger ease-tau-out grid size-6 shrink-0 cursor-pointer place-items-center rounded-[7px] opacity-0 transition-opacity duration-[160ms] group-hover/srow:opacity-100"
                    onClick={() => handleRemove(index)}
                  >
                    <X className="size-3.5" strokeWidth={2.2} />
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col px-0.5">
            <div className="flex flex-col items-center gap-1 py-4 text-center">
              <p className="text-tau-body text-ink-2 font-medium">{t("sort.emptyTitle")}</p>
              <p className="text-tau-meta text-ink-3">{t("sort.emptyHint")}</p>
            </div>
            {suggestColumns.length > 0 && (
              <div className="flex flex-col gap-0.5">
                {suggestColumns.map(column => (
                  <button
                    key={column.id}
                    type="button"
                    className="text-ink-2 hover:bg-hover hover:text-ink-1 ease-tau-out rounded-tau-sm flex h-8 cursor-pointer items-center gap-2 border-none bg-transparent px-2 text-left transition-colors duration-[160ms]"
                    onClick={() => appendRule(column.id)}
                  >
                    <ColumnIcon type={column.type} pluginManager={pluginManager} />
                    <span className="text-tau-sm truncate">{column.title}</span>
                    <span className="text-ink-3 ml-auto text-[10.5px]">
                      {t("sort.dir.newToOld")}
                    </span>
                    <Plus className="text-accent-text size-3 shrink-0" strokeWidth={2.2} />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          className="text-ink-2 hover:bg-hover hover:text-ink-1 rounded-tau-sm text-tau-sm ease-tau-out flex w-full cursor-pointer items-center gap-1 border-none bg-transparent px-2 py-1.5 transition-colors duration-[160ms] disabled:cursor-not-allowed disabled:opacity-40"
          onClick={handleAddSort}
          disabled={!availableColumns.length}
        >
          <Plus className="size-3.5" strokeWidth={2.1} />
          <span>{localSorts.length ? t("sort.addField") : t("sort.pickField")}</span>
        </button>

        <div className="border-line-2 mt-1 flex items-center gap-1.5 border-t px-1 pt-2.5">
          {localSorts.length > 0 && (
            <button
              type="button"
              className="text-tau-micro text-ink-3 hover:text-danger ease-tau-out cursor-pointer rounded-[6px] px-1.5 py-1 transition-colors duration-[160ms]"
              onClick={handleClearAll}
            >
              {t("common.clear")}
            </button>
          )}
          <span className="flex-1" />
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" size="sm" onClick={handleConfirm}>
            {t("common.confirm")}
          </Button>
        </div>
      </div>
    );
  }
);

SortPanel.displayName = "SortPanel";

export default SortPanel;
