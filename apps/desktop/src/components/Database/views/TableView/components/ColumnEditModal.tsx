import React, { useEffect, useState } from "react";
import { ColumnDef, SelectOption } from "../../../types";
import { v4 as uuid } from "uuid";
import { SELECT_COLORS } from "../../../constants";
import SelectList from "./SelectList";
import PluginManager from "../../../PluginManager";
import { DatePluginConfig } from "../../../plugins/DatePlugin/index";
import { Button, Dialog, Input, Select, Checkbox } from "@tau/ui";

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
  const [options, setOptions] = useState<SelectOption[]>([]);
  const [optionInput, setOptionInput] = useState("");
  const [showTime, setShowTime] = useState(false);
  const [isRange, setIsRange] = useState(false);
  const [sortField, setSortField] = useState<"start" | "end">("start");
  const [groupField, setGroupField] = useState<"start" | "end">("start");
  const [titleError, setTitleError] = useState("");

  const plugins = pluginManager.getAllPlugins();
  const pluginOptions = plugins.map(plugin => ({
    label: plugin.name,
    value: plugin.type,
  }));

  const dateFieldOptions = [
    { label: "开始日期", value: "start" },
    { label: "结束日期", value: "end" },
  ];

  useEffect(() => {
    if (open) {
      if (column) {
        setTitle(column.title);
        setType(column.type);
        setWidth(column.width ?? 200);

        const colWithOptions = column as ColumnDef<{ options: SelectOption[] }>;
        if (Array.isArray(colWithOptions.config?.options)) {
          setOptions(colWithOptions.config!.options as SelectOption[]);
        } else {
          setOptions([]);
        }

        if (column.type === "date") {
          const dateConfig = column.config as DatePluginConfig;
          setShowTime(dateConfig?.showTime ?? false);
          setIsRange(dateConfig?.isRange ?? false);
          setSortField(dateConfig?.sortField ?? "start");
          setGroupField(dateConfig?.groupField ?? "start");
        } else {
          setShowTime(false);
          setIsRange(false);
          setSortField("start");
          setGroupField("start");
        }
      } else {
        setTitle("列名");
        setType("text");
        setWidth(200);
        setOptions([]);
        setShowTime(false);
        setIsRange(false);
        setSortField("start");
        setGroupField("start");
      }
      setTitleError("");
      setOptionInput("");
    }
  }, [open, column?.id]);

  const handleOk = () => {
    if (!title.trim()) {
      setTitleError("请输入列标题");
      return;
    }

    const rawWidth = typeof width === "number" ? width : Number(width);
    const normalizedWidth = Math.max(50, Math.min(500, Number.isFinite(rawWidth) ? rawWidth : 200));

    const includeConfig = type === "select" || type === "multiSelect" || type === "date";

    let config: Record<string, unknown> | undefined;
    if (type === "select" || type === "multiSelect") {
      config = { options };
    } else if (type === "date") {
      config = { showTime, isRange, sortField, groupField };
    }

    const payload: Partial<ColumnDef> = {
      title,
      type,
      width: normalizedWidth,
      ...(includeConfig ? { config } : {}),
    };

    onSave(payload);
  };

  const addOption = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (options.some(o => o.name === trimmed)) return;
    const newOption: SelectOption = {
      id: uuid(),
      name: trimmed,
      color: SELECT_COLORS[(options.length + 1) % SELECT_COLORS.length],
    };
    setOptions([...options, newOption]);
  };

  const removeOption = (id: string) => {
    setOptions(options.filter(op => op.id !== id));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!next) onCancel();
      }}
      title={column ? "编辑列" : "新建列"}
      width={400}
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
          <Select value={type} onValueChange={setType} options={pluginOptions} className="w-full" />
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

        {/* 选项配置（select / multiSelect） */}
        {(type === "select" || type === "multiSelect") && (
          <div className="flex flex-col gap-1.5">
            <span className={labelClass}>选项</span>
            <Input
              value={optionInput}
              onChange={e => setOptionInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addOption(optionInput);
                  setOptionInput("");
                }
              }}
              placeholder="输入后按回车新增"
            />
            {options.length > 0 && (
              <div className="mt-1">
                <SelectList options={options} onClear={removeOption} className="flex-wrap" />
              </div>
            )}
          </div>
        )}

        {/* 日期类型配置 */}
        {type === "date" && (
          <div className="flex flex-col gap-3">
            <Checkbox
              checked={showTime}
              onChange={() => setShowTime(!showTime)}
              label={<span className="text-tau-body text-ink-1">包含时间</span>}
            />

            <Checkbox
              checked={isRange}
              onChange={() => setIsRange(!isRange)}
              label={<span className="text-tau-body text-ink-1">结束日期</span>}
            />

            {isRange && (
              <>
                <div className="flex flex-col gap-1.5">
                  <span className={labelClass}>排序依据</span>
                  <Select
                    value={sortField}
                    onValueChange={value => setSortField(value as "start" | "end")}
                    options={dateFieldOptions}
                    className="w-full"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className={labelClass}>分组依据</span>
                  <Select
                    value={groupField}
                    onValueChange={value => setGroupField(value as "start" | "end")}
                    options={dateFieldOptions}
                    className="w-full"
                  />
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
};

export default ColumnEditModal;
