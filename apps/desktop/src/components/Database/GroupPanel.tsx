import React, { useState, useMemo, useEffect } from "react";
import { Check } from "lucide-react";
import { cn, Button } from "@tau/ui";
import { ColumnDef, TableViewConfig, GroupGranularity } from "./types";
import PluginManager from "./PluginManager";
import ColumnIcon from "./ColumnIcon";
import { useDatabaseStore } from "./hooks";

interface GroupPanelProps {
  columns: ColumnDef[];
  config: TableViewConfig["groupBy"] | null;
  onClose: () => void;
  onSubmit: (config: TableViewConfig["groupBy"] | null) => void;
  pluginManager: PluginManager;
}

const GRANULARITY_OPTIONS: Array<{ value: GroupGranularity; label: string }> = [
  { value: "day", label: "按日" },
  { value: "week", label: "按周" },
  { value: "month", label: "按月" },
];

const GroupPanel: React.FC<GroupPanelProps> = ({
  columns,
  config,
  onClose,
  onSubmit,
  pluginManager,
}) => {
  const rows = useDatabaseStore(state => state.rows);

  const supportedColumns = useMemo(() => {
    return columns.filter(
      column => typeof pluginManager.getPlugin(column.type)?.getGroupKey === "function"
    );
  }, [columns, pluginManager]);

  const [selectedId, setSelectedId] = useState<string>("");
  const [granularity, setGranularity] = useState<GroupGranularity>("month");

  useEffect(() => {
    setSelectedId(config?.fieldId ?? "");
    setGranularity(config?.granularity ?? "month");
  }, [config]);

  const selectedColumn = supportedColumns.find(col => col.id === selectedId) ?? null;

  /** 各字段按当前（或默认）粒度分组的组数预览 */
  const groupCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const column of supportedColumns) {
      const getGroupKey = pluginManager.getPlugin(column.type)?.getGroupKey;
      if (!getGroupKey) continue;
      const effectiveGranularity = column.type === "date" ? granularity : undefined;
      const keys = new Set<string>();
      for (const row of rows) {
        keys.add(getGroupKey(row, column, effectiveGranularity));
      }
      counts.set(column.id, keys.size);
    }
    return counts;
  }, [supportedColumns, rows, pluginManager, granularity]);

  const handleSelect = (id: string) => {
    setSelectedId(id);
  };

  const handleConfirm = () => {
    if (!selectedId || !selectedColumn) {
      onSubmit(null);
      onClose();
      return;
    }

    onSubmit({
      id: selectedColumn.id,
      fieldId: selectedColumn.id,
      strategy: selectedColumn.type,
      ...(selectedColumn.type === "date" ? { granularity } : {}),
    });
    onClose();
  };

  return (
    <div className="text-ink-1 flex w-[264px] flex-col gap-1.5 p-2.5">
      <div className="flex items-baseline gap-2 px-1">
        <span className="text-tau-meta text-ink-1 font-semibold">分组</span>
        <span className="text-tau-micro text-ink-3">按字段值聚合行</span>
      </div>
      <div className="flex flex-col gap-0.5">
        <button
          type="button"
          className={cn(
            "ease-tau-out rounded-tau-sm flex h-7 w-full cursor-pointer items-center gap-2 border-none bg-transparent px-2 transition-colors duration-[160ms]",
            selectedId === ""
              ? "bg-selected text-ink-1 font-medium"
              : "text-ink-2 hover:bg-hover hover:text-ink-1"
          )}
          onClick={() => handleSelect("")}
        >
          <span className="text-tau-sm flex-1 text-left">无</span>
          {selectedId === "" && <Check className="text-accent-text size-3.5" strokeWidth={2.4} />}
        </button>
        {supportedColumns.map(column => {
          const active = selectedId === column.id;
          const count = groupCounts.get(column.id);
          return (
            <React.Fragment key={column.id}>
              <button
                type="button"
                className={cn(
                  "ease-tau-out rounded-tau-sm flex h-7 w-full cursor-pointer items-center gap-2 border-none bg-transparent px-2 transition-colors duration-[160ms]",
                  active
                    ? "bg-selected text-ink-1 font-medium"
                    : "text-ink-2 hover:bg-hover hover:text-ink-1"
                )}
                onClick={() => handleSelect(column.id)}
              >
                <ColumnIcon type={column.type} pluginManager={pluginManager} />
                <span className="text-tau-sm flex-1 truncate text-left">{column.title}</span>
                {count !== undefined && (
                  <span className="text-tau-micro text-ink-3 shrink-0 tabular-nums">
                    {count} 组
                  </span>
                )}
                {active && (
                  <Check className="text-accent-text size-3.5 shrink-0" strokeWidth={2.4} />
                )}
              </button>
              {active && column.type === "date" && (
                <div className="bg-group rounded-tau-sm ml-7 flex w-[176px] p-0.5">
                  {GRANULARITY_OPTIONS.map(option => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setGranularity(option.value)}
                      className={cn(
                        "text-tau-sm ease-tau-out h-5 flex-1 cursor-pointer rounded-[5px] transition-colors duration-[160ms]",
                        granularity === option.value
                          ? "bg-surface text-ink-1 shadow-card font-medium"
                          : "text-ink-2 hover:text-ink-1"
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
      <div className="text-tau-micro text-ink-3 px-2">选「无」取消分组；日期字段可选聚合粒度</div>
      <div className="border-line-2 mt-1 flex items-center gap-1.5 border-t px-1 pt-2.5">
        <span className="flex-1" />
        <Button variant="ghost" size="sm" onClick={onClose}>
          取消
        </Button>
        <Button variant="primary" size="sm" onClick={handleConfirm}>
          确定
        </Button>
      </div>
    </div>
  );
};

export default GroupPanel;
