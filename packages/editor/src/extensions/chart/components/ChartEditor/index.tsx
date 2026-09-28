import React, { useState, useCallback, useRef } from "react";
import { Table, Code, Upload, ChevronDown } from "lucide-react";
import { CustomModal, CustomCheckbox, SelectDropDown } from "@tau/shared";
import type { ChartConfig, ChartType } from "../../../../types";
import TableEditor from "./TableEditor";
import JsonEditor from "./JsonEditor";
import ChartTypeSelector from "./ChartTypeSelector";
import CsvImporter from "./CsvImporter";
import ChartPreview from "../ChartPreview";
import { EDITOR_MODAL_THEME } from "../../../../theme/modalTheme";

interface ChartEditorProps {
  data: Record<string, string | number>[];
  config: ChartConfig;
  onChange: (data: Record<string, string | number>[], config: ChartConfig) => void;
  onClose: () => void;
}

type EditorMode = "table" | "json";

const ChartEditor: React.FC<ChartEditorProps> = ({
  data: initialData,
  config: initialConfig,
  onChange,
  onClose,
}) => {
  const [data, setData] = useState(initialData);
  const [config, setConfig] = useState(initialConfig);
  const [mode, setMode] = useState<EditorMode>("table");
  const [showCsvImporter, setShowCsvImporter] = useState(false);
  const [showPieStyleDropdown, setShowPieStyleDropdown] = useState(false);
  const pieStyleTriggerRef = useRef<HTMLButtonElement>(null);

  const handleDataChange = useCallback((newData: Record<string, string | number>[]) => {
    setData(newData);
  }, []);

  const handleConfigChange = useCallback((newConfig: Partial<ChartConfig>) => {
    setConfig(prev => ({ ...prev, ...newConfig }));
  }, []);

  const handleTypeChange = useCallback((type: ChartType) => {
    setConfig(prev => {
      const isSingleSeriesType = ["scatter", "pie", "funnel"].includes(type);
      return {
        ...prev,
        type,
        series: isSingleSeriesType ? prev.series.slice(0, 1) : prev.series,
      };
    });
  }, []);

  const handleCsvImport = useCallback((importedData: Record<string, string | number>[]) => {
    if (importedData.length > 0) {
      const keys = Object.keys(importedData[0]);
      const xAxisKey = keys[0];
      const series = keys.slice(1).map((key, i) => ({
        dataKey: key,
        name: key,
        color: ["#6366f1", "#ec4899", "#14b8a6", "#f59e0b"][i % 4],
      }));
      setData(importedData);
      setConfig(prev => ({ ...prev, xAxisKey, series }));
    }
    setShowCsvImporter(false);
  }, []);

  const handleSave = () => {
    onChange(data, config);
    onClose();
  };

  const headerContent = (
    <div className="flex items-center gap-3">
      <ChartTypeSelector value={config.type} onChange={handleTypeChange} />
      <div className="flex rounded-lg bg-gray-100 p-0.5 dark:bg-zinc-800">
        <button
          onClick={() => setMode("table")}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-all ${
            mode === "table"
              ? "bg-white text-gray-900 shadow-sm dark:bg-zinc-700 dark:text-white"
              : "text-gray-500 hover:text-[var(--ed-text)] dark:hover:text-slate-300"
          }`}
        >
          <Table size={14} />
          表格
        </button>
        <button
          onClick={() => setMode("json")}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-all ${
            mode === "json"
              ? "bg-white text-gray-900 shadow-sm dark:bg-zinc-700 dark:text-white"
              : "text-gray-500 hover:text-[var(--ed-text)] dark:hover:text-slate-300"
          }`}
        >
          <Code size={14} />
          JSON
        </button>
      </div>
      <button
        onClick={() => setShowCsvImporter(true)}
        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-gray-500 transition-colors hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-zinc-800"
      >
        <Upload size={14} />
        导入 CSV
      </button>
    </div>
  );

  return (
    <CustomModal
      open={true}
      onCancel={onClose}
      onOk={handleSave}
      okText="保存"
      cancelText="取消"
      title={headerContent}
      width={800}
      themeColors={EDITOR_MODAL_THEME}
    >
      <div className="flex flex-col gap-4 text-sm">
        {/* Data Editor - top with max height */}
        <div className="max-h-[280px] overflow-auto">
          {mode === "table" ? (
            <TableEditor
              data={data}
              config={config}
              onDataChange={handleDataChange}
              onConfigChange={handleConfigChange}
            />
          ) : (
            <JsonEditor
              data={data}
              config={config}
              onDataChange={handleDataChange}
              onConfigChange={handleConfigChange}
            />
          )}
        </div>

        {/* Settings */}
        <div className="flex items-center gap-6 text-[var(--ed-text-secondary)]">
          <label className="flex cursor-pointer items-center gap-2">
            <CustomCheckbox
              checked={config.showGrid ?? true}
              onChange={() => handleConfigChange({ showGrid: !config.showGrid })}
              accentColor="#6366f1"
            />
            <span>显示网格</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <CustomCheckbox
              checked={config.showLegend ?? true}
              onChange={() => handleConfigChange({ showLegend: !config.showLegend })}
              accentColor="#6366f1"
            />
            <span>显示图例</span>
          </label>
          {config.type === "pie" && (
            <div className="relative flex items-center gap-2">
              <span className="text-sm">样式:</span>
              <button
                ref={pieStyleTriggerRef}
                onClick={() => setShowPieStyleDropdown(!showPieStyleDropdown)}
                className="flex items-center gap-1 rounded-lg bg-gray-100 px-3 py-1.5 text-gray-700 transition-colors hover:bg-[var(--ed-bg-hover)] dark:text-slate-200 dark:hover:bg-zinc-700"
              >
                {config.pieStyle === "donut"
                  ? "环形图"
                  : config.pieStyle === "rose"
                    ? "玫瑰图"
                    : "普通饼图"}
                <ChevronDown size={14} />
              </button>
              <SelectDropDown
                items={[
                  { label: "普通饼图", value: "normal" },
                  { label: "环形图", value: "donut" },
                  { label: "玫瑰图", value: "rose" },
                ]}
                selectedKey={config.pieStyle || "normal"}
                show={showPieStyleDropdown}
                onClose={() => setShowPieStyleDropdown(false)}
                onSelect={item => {
                  handleConfigChange({
                    pieStyle: item.value as "normal" | "donut" | "rose",
                  });
                }}
                triggerElement={pieStyleTriggerRef.current}
                getKey={item => item.value}
                renderItem={item => <span className="text-sm">{item.label}</span>}
                width={120}
              />
            </div>
          )}
          {["scatter", "pie", "funnel"].includes(config.type) && (
            <span className="text-xs text-amber-600 dark:text-amber-400">
              该图表类型仅支持单个系列
            </span>
          )}
        </div>

        {/* Chart Preview - bottom */}
        <div className="rounded-xl border border-[#f0f0f0] bg-white p-4 dark:border-[#2a2a2a] dark:bg-[#1a1a1a]">
          <div className="mb-3 text-xs text-[var(--ed-text-tertiary)]">预览</div>
          <div className="h-[280px]">
            <ChartPreview data={data} config={config} />
          </div>
        </div>
      </div>

      {showCsvImporter && (
        <CsvImporter onImport={handleCsvImport} onClose={() => setShowCsvImporter(false)} />
      )}
    </CustomModal>
  );
};

export default ChartEditor;
