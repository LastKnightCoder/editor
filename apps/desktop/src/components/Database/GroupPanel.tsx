import React, { useState, useMemo, useEffect } from "react";
import classNames from "classnames";
import { ColumnDef, TableViewConfig } from "./types";
import PluginManager from "./PluginManager";
import ColumnIcon from "./ColumnIcon";
import { Button } from "@tau/ui/Button";

interface GroupPanelProps {
  columns: ColumnDef[];
  config: TableViewConfig["groupBy"] | null;
  onClose: () => void;
  onSubmit: (config: TableViewConfig["groupBy"] | null) => void;
  pluginManager: PluginManager;
}

const GroupPanel: React.FC<GroupPanelProps> = ({
  columns,
  config,
  onClose,
  onSubmit,
  pluginManager,
}) => {
  const supportedColumns = useMemo(() => {
    return columns.filter(
      column => typeof pluginManager.getPlugin(column.type)?.getGroupKey === "function"
    );
  }, [columns, pluginManager]);

  const [selectedId, setSelectedId] = useState<string>("");

  useEffect(() => {
    setSelectedId(config?.fieldId ?? "");
  }, [config]);

  const handleConfirm = () => {
    if (!selectedId) {
      onSubmit(null);
      onClose();
      return;
    }
    const column = supportedColumns.find(col => col.id === selectedId);
    if (!column) {
      onSubmit(null);
      onClose();
      return;
    }

    onSubmit({
      id: column.id,
      fieldId: column.id,
      strategy: column.type,
    });
    onClose();
  };

  const handleSelect = (id: string) => {
    setSelectedId(id);
  };

  return (
    <div className="text-ink-1 flex w-64 flex-col gap-1.5 py-1">
      <div className="text-tau-micro text-ink-2 px-2.5 py-1 font-medium">分组方式</div>
      <div className="flex flex-col gap-0.5">
        <button
          type="button"
          className={classNames(
            "rounded-tau-sm text-tau-sm ease-tau-out flex w-full cursor-pointer items-center gap-2 border-none bg-transparent px-2.5 py-1.5 transition-colors duration-[160ms]",
            selectedId === ""
              ? "bg-selected text-ink-1 font-medium"
              : "text-ink-2 hover:bg-hover hover:text-ink-1"
          )}
          onClick={() => handleSelect("")}
        >
          <span className="flex-1 text-left">无</span>
        </button>
        {supportedColumns.map(column => (
          <button
            key={column.id}
            type="button"
            className={classNames(
              "rounded-tau-sm text-tau-sm ease-tau-out flex w-full cursor-pointer items-center gap-2 border-none bg-transparent px-2.5 py-1.5 transition-colors duration-[160ms]",
              selectedId === column.id
                ? "bg-selected text-ink-1 font-medium"
                : "text-ink-2 hover:bg-hover hover:text-ink-1"
            )}
            onClick={() => handleSelect(column.id)}
          >
            <ColumnIcon type={column.type} pluginManager={pluginManager} />
            <span className="flex-1 truncate text-left">{column.title}</span>
          </button>
        ))}
      </div>
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
};

export default GroupPanel;
