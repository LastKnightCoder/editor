import React, { useState, useMemo, useEffect } from "react";
import classNames from "classnames";
import { ColumnDef, TableViewConfig } from "./types";
import PluginManager from "./PluginManager";
import ColumnIcon from "./ColumnIcon";

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
      (column) =>
        typeof pluginManager.getPlugin(column.type)?.getGroupKey === "function",
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
    const column = supportedColumns.find((col) => col.id === selectedId);
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
    <div className="w-64 flex flex-col gap-1 text-[rgba(15,23,42,0.95)] dark:text-[rgba(241,245,249,0.95)]">
      <div className="px-2 py-1 text-xs font-medium text-[rgba(15,23,42,0.55)] dark:text-[rgba(226,232,240,0.55)]">
        分组方式
      </div>
      <div className="flex flex-col gap-1">
        <button
          type="button"
          className={classNames(
            "w-full border-none bg-transparent px-3 py-2 rounded-[14px] flex items-center gap-2 text-[13px] cursor-pointer transition-all",
            selectedId === ""
              ? "bg-[rgba(255,255,255,0.6)] dark:bg-[rgba(148,163,184,0.15)]"
              : "hover:bg-[rgba(255,255,255,0.6)] dark:hover:bg-[rgba(148,163,184,0.15)]",
          )}
          onClick={() => handleSelect("")}
        >
          <span className="flex-1 text-left">无</span>
        </button>
        {supportedColumns.map((column) => (
          <button
            key={column.id}
            type="button"
            className={classNames(
              "w-full border-none bg-transparent px-3 py-2 rounded-[14px] flex items-center gap-2 text-[13px] cursor-pointer transition-all",
              selectedId === column.id
                ? "bg-[rgba(255,255,255,0.6)] dark:bg-[rgba(148,163,184,0.15)]"
                : "hover:bg-[rgba(255,255,255,0.6)] dark:hover:bg-[rgba(148,163,184,0.15)]",
            )}
            onClick={() => handleSelect(column.id)}
          >
            <ColumnIcon type={column.type} pluginManager={pluginManager} />
            <span className="flex-1 text-left">{column.title}</span>
          </button>
        ))}
      </div>
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
};

export default GroupPanel;
