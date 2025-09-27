import React, { useState, useMemo, useEffect } from "react";
import { Radio, Button } from "antd";
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

  const handleCancel = () => {
    setSelectedId(config?.fieldId ?? "");
    onClose();
  };

  return (
    <div className="w-64" onClick={(event) => event.stopPropagation()}>
      <div className="text-base font-semibold mb-3">分组方式</div>
      <div className="text-sm text-[#807D78] dark:text-[#A5A199] mb-2">
        请选择要分组的字段：
      </div>
      <Radio.Group
        value={selectedId}
        onChange={(event) => setSelectedId(event.target.value)}
        className="flex! flex-col gap-4!"
      >
        <Radio value="" className="flex h-6 items-center">
          <span className="flex h-6 items-center gap-1 text-[#2C2C2C] dark:text-[#FFFFFF]">
            无
          </span>
        </Radio>
        {supportedColumns.map((column) => {
          return (
            <Radio
              key={column.id}
              value={column.id}
              className="flex h-6 items-center"
            >
              <span className="flex h-6 items-center gap-1 text-[#2C2C2C] dark:text-[#FFFFFF]">
                <ColumnIcon type={column.type} pluginManager={pluginManager} />
                <span>{column.title}</span>
              </span>
            </Radio>
          );
        })}
      </Radio.Group>
      <div className="flex justify-end gap-2 pt-3">
        <Button onClick={handleCancel}>取消</Button>
        <Button onClick={handleConfirm}>确定</Button>
      </div>
    </div>
  );
};

export default GroupPanel;
