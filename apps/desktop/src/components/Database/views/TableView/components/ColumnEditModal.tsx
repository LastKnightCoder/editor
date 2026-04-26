import React, { useEffect, useRef, useState } from "react";
import { ColumnDef, SelectOption } from "../../../types";
import { v4 as uuid } from "uuid";
import { SELECT_COLORS } from "../../../constants";
import SelectList from "./SelectList";
import PluginManager from "../../../PluginManager";
import CustomCheckbox from "@/components/CustomCheckbox";
import { DatePluginConfig } from "../../../plugins/DatePlugin/index";
import CustomModal from "@/components/CustomModal";
import { SelectDropDown } from "@tau/shared";

interface ColumnEditModalProps {
  open: boolean;
  column: ColumnDef | null;
  onCancel: () => void;
  onSave: (column: Partial<ColumnDef>) => void;
  theme: "light" | "dark";
  pluginManager: PluginManager;
}

const inputClass =
  "w-full px-4 py-3.5 rounded-xl text-sm outline-none transition-all bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-white shadow-inner placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-indigo-500 focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(99,102,241,0.15)] dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(99,102,241,0.25)]";

const labelClass =
  "text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400";

const ColumnEditModal: React.FC<ColumnEditModalProps> = ({
  open,
  column,
  onCancel,
  onSave,
  theme = "light",
  pluginManager,
}) => {
  const typeButtonRef = useRef<HTMLButtonElement>(null);
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);

  const sortButtonRef = useRef<HTMLButtonElement>(null);
  const [showSortDropdown, setShowSortDropdown] = useState(false);

  const groupButtonRef = useRef<HTMLButtonElement>(null);
  const [showGroupDropdown, setShowGroupDropdown] = useState(false);

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
  const pluginOptions = plugins.map((plugin) => ({
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
      setShowTypeDropdown(false);
      setShowSortDropdown(false);
      setShowGroupDropdown(false);
    }
  }, [open, column?.id]);

  const handleOk = () => {
    if (!title.trim()) {
      setTitleError("请输入列标题");
      return;
    }

    const rawWidth = typeof width === "number" ? width : Number(width);
    const normalizedWidth = Math.max(
      50,
      Math.min(500, Number.isFinite(rawWidth) ? rawWidth : 200),
    );

    const includeConfig =
      type === "select" || type === "multiSelect" || type === "date";

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
    if (options.some((o) => o.name === trimmed)) return;
    const newOption: SelectOption = {
      id: uuid(),
      name: trimmed,
      color: SELECT_COLORS[(options.length + 1) % SELECT_COLORS.length],
    };
    setOptions([...options, newOption]);
  };

  const removeOption = (id: string) => {
    setOptions(options.filter((op) => op.id !== id));
  };

  return (
    <CustomModal
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      title={column ? "编辑列" : "新建列"}
      okText="保存"
      cancelText="取消"
      width={400}
      destroyOnClose
      maskClosable={false}
      bodyClassName="px-2 pb-2 -mx-2"
    >
      <div className="space-y-4">
        {/* 列标题 */}
        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>列标题</label>
          <input
            type="text"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (e.target.value.trim()) setTitleError("");
            }}
            className={inputClass}
            placeholder="请输入列标题"
          />
          {titleError && (
            <p className="text-xs text-red-500 dark:text-red-400">
              {titleError}
            </p>
          )}
        </div>

        {/* 列类型 */}
        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>列类型</label>
          <button
            ref={typeButtonRef}
            type="button"
            onClick={() => setShowTypeDropdown((v) => !v)}
            className={`${inputClass} flex items-center justify-between cursor-pointer`}
          >
            <span>
              {pluginOptions.find((p) => p.value === type)?.label ?? type}
            </span>
            <svg
              className={`w-4 h-4 shrink-0 ml-2 text-gray-400 dark:text-slate-500 transition-transform ${showTypeDropdown ? "rotate-180" : ""}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
          <SelectDropDown
            items={pluginOptions}
            selectedKey={type}
            show={showTypeDropdown}
            onClose={() => setShowTypeDropdown(false)}
            onSelect={(item) => setType(item.value)}
            triggerElement={typeButtonRef.current}
            getKey={(item) => item.value}
            renderItem={(item) => item.label}
          />
        </div>

        {/* 列宽度 */}
        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>列宽度</label>
          <input
            type="number"
            min={50}
            max={500}
            value={width}
            onChange={(e) => setWidth(Number(e.target.value))}
            className={`${inputClass} [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
            placeholder="200"
          />
        </div>

        {/* 选项配置（select / multiSelect） */}
        {(type === "select" || type === "multiSelect") && (
          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>选项</label>
            <input
              type="text"
              value={optionInput}
              onChange={(e) => setOptionInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addOption(optionInput);
                  setOptionInput("");
                }
              }}
              className={inputClass}
              placeholder="输入后按回车新增"
            />
            {options.length > 0 && (
              <div className="mt-1">
                <SelectList
                  options={options}
                  theme={theme}
                  onClear={removeOption}
                  className="flex-wrap"
                />
              </div>
            )}
          </div>
        )}

        {/* 日期类型配置 */}
        {type === "date" && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <CustomCheckbox
                checked={showTime}
                onChange={() => setShowTime(!showTime)}
              />
              <span className="text-sm text-gray-700 dark:text-gray-200">
                包含时间
              </span>
            </div>

            <div className="flex items-center gap-3">
              <CustomCheckbox
                checked={isRange}
                onChange={() => setIsRange(!isRange)}
              />
              <span className="text-sm text-gray-700 dark:text-gray-200">
                结束日期
              </span>
            </div>

            {isRange && (
              <>
                <div className="flex flex-col gap-1.5">
                  <label className={labelClass}>排序依据</label>
                  <button
                    ref={sortButtonRef}
                    type="button"
                    onClick={() => setShowSortDropdown((v) => !v)}
                    className={`${inputClass} flex items-center justify-between cursor-pointer`}
                  >
                    <span>
                      {dateFieldOptions.find((o) => o.value === sortField)
                        ?.label ?? sortField}
                    </span>
                    <svg
                      className={`w-4 h-4 shrink-0 ml-2 text-gray-400 dark:text-slate-500 transition-transform ${showSortDropdown ? "rotate-180" : ""}`}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </button>
                  <SelectDropDown
                    items={dateFieldOptions}
                    selectedKey={sortField}
                    show={showSortDropdown}
                    onClose={() => setShowSortDropdown(false)}
                    onSelect={(item) =>
                      setSortField(item.value as "start" | "end")
                    }
                    triggerElement={sortButtonRef.current}
                    getKey={(item) => item.value}
                    renderItem={(item) => item.label}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className={labelClass}>分组依据</label>
                  <button
                    ref={groupButtonRef}
                    type="button"
                    onClick={() => setShowGroupDropdown((v) => !v)}
                    className={`${inputClass} flex items-center justify-between cursor-pointer`}
                  >
                    <span>
                      {dateFieldOptions.find((o) => o.value === groupField)
                        ?.label ?? groupField}
                    </span>
                    <svg
                      className={`w-4 h-4 shrink-0 ml-2 text-gray-400 dark:text-slate-500 transition-transform ${showGroupDropdown ? "rotate-180" : ""}`}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </button>
                  <SelectDropDown
                    items={dateFieldOptions}
                    selectedKey={groupField}
                    show={showGroupDropdown}
                    onClose={() => setShowGroupDropdown(false)}
                    onSelect={(item) =>
                      setGroupField(item.value as "start" | "end")
                    }
                    triggerElement={groupButtonRef.current}
                    getKey={(item) => item.value}
                    renderItem={(item) => item.label}
                  />
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </CustomModal>
  );
};

export default ColumnEditModal;
