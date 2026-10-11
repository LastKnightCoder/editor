import React, { useEffect, useState } from "react";
import { ColumnDef } from "../../../types";
import PluginManager from "../../../PluginManager";
import { Button, Dialog, DialogBody, Input, Select } from "@tau/ui";
import { useDatabaseStore } from "../../../hooks";

interface ColumnEditModalProps {
  open: boolean;
  column: ColumnDef | null;
  onCancel: () => void;
  onSave: (column: Partial<ColumnDef>) => void;
  theme: "light" | "dark";
  pluginManager: PluginManager;
}

const labelClass = "text-tau-meta font-medium text-ink-2";

const ColumnEditModal: React.FC<ColumnEditModalProps> = ({
  open,
  column,
  onCancel,
  onSave,
  pluginManager,
}) => {
  const [title, setTitle] = useState("列名");
  const [type, setType] = useState("text");
  const [width, setWidth] = useState(200);
  const [draftConfig, setDraftConfig] = useState<unknown>(undefined);
  const [titleError, setTitleError] = useState("");
  const [configError, setConfigError] = useState<string | null>(null);
  const { columns, rows } = useDatabaseStore(state => ({
    columns: state.columns,
    rows: state.rows,
  }));

  const plugins = pluginManager.getAllPlugins();
  const pluginOptions = plugins.map(plugin => ({
    label: plugin.name,
    value: plugin.type,
  }));

  const plugin = pluginManager.getPlugin(type);
  const ConfigPanel = plugin?.ConfigPanel;

  useEffect(() => {
    if (open) {
      if (column) {
        setTitle(column.title);
        setType(column.type);
        setWidth(column.width ?? 200);
        setDraftConfig(column.config);
      } else {
        setTitle("列名");
        setType("text");
        setWidth(200);
        setDraftConfig(undefined);
      }
      setTitleError("");
      setConfigError(null);
    }
  }, [open, column?.id]);

  /** 切换类型时草稿配置回原列配置（切回原类型）或清空（换成其它类型） */
  const handleTypeChange = (next: string) => {
    setType(next);
    setDraftConfig(next === column?.type ? column.config : undefined);
  };

  const handleOk = () => {
    if (!title.trim()) {
      setTitleError("请输入列标题");
      return;
    }

    const rawWidth = typeof width === "number" ? width : Number(width);
    const normalizedWidth = Math.max(50, Math.min(500, Number.isFinite(rawWidth) ? rawWidth : 200));

    let config = draftConfig;
    if (plugin?.validateConfig) {
      const result = plugin.validateConfig(draftConfig, { column, columns, rows, pluginManager });
      if (!result.ok) {
        setConfigError(result.message);
        return;
      }
      config = result.config;
    }

    const payload: Partial<ColumnDef> = {
      title,
      type,
      width: normalizedWidth,
      ...(ConfigPanel ? { config } : {}),
    };

    onSave(payload);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!next) onCancel();
      }}
      title={column ? "编辑列" : "新建列"}
      width={ConfigPanel?.dialogWidth ?? 400}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onCancel}>
            取消
          </Button>
          <Button variant="primary" size="sm" onClick={handleOk}>
            保存
          </Button>
        </>
      }
    >
      <DialogBody>
        <div className="flex flex-col gap-4">
          {/* 列标题 */}
          <div className="flex flex-col gap-1.5">
            <span className={labelClass}>列标题</span>
            <Input
              value={title}
              onChange={e => {
                setTitle(e.target.value);
                if (e.target.value.trim()) setTitleError("");
              }}
              placeholder="请输入列标题"
              aria-invalid={titleError ? true : undefined}
            />
            {titleError && <p className="text-danger text-tau-sm">{titleError}</p>}
          </div>

          {/* 列类型 */}
          <div className="flex flex-col gap-1.5">
            <span className={labelClass}>列类型</span>
            <Select
              value={type}
              onValueChange={handleTypeChange}
              options={pluginOptions}
              className="w-full"
            />
          </div>

          {/* 列宽度 */}
          <div className="flex flex-col gap-1.5">
            <span className={labelClass}>列宽度</span>
            <input
              type="number"
              min={50}
              max={500}
              value={width}
              onChange={e => setWidth(Number(e.target.value))}
              className="border-line-1 bg-surface text-ink-1 placeholder:text-ink-3 focus:border-accent rounded-tau-sm text-tau-body w-full border px-3 py-2 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              placeholder="200"
            />
          </div>

          {/* 字段配置：由字段插件声明（D-130），未声明的类型不显示也不改动 config */}
          {ConfigPanel && (
            <ConfigPanel
              config={draftConfig as never}
              onChange={setDraftConfig}
              column={column as never}
              columns={columns}
              rows={rows}
              pluginManager={pluginManager}
              title={title}
              error={configError}
              setError={setConfigError}
            />
          )}
        </div>
      </DialogBody>
    </Dialog>
  );
};

export default ColumnEditModal;
