import React, { useState, useCallback } from "react";
import { Table, Code, Upload } from "lucide-react";
import { CustomModal, CustomCheckbox } from "@tau/shared";
import type { ChartConfig, ChartType } from "../../../../types";
import TableEditor from "./TableEditor";
import JsonEditor from "./JsonEditor";
import ChartTypeSelector from "./ChartTypeSelector";
import CsvImporter from "./CsvImporter";
import ChartPreview from "../ChartPreview";

interface ChartEditorProps {
  data: Record<string, string | number>[];
  config: ChartConfig;
  onChange: (
    data: Record<string, string | number>[],
    config: ChartConfig,
  ) => void;
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

  const handleDataChange = useCallback(
    (newData: Record<string, string | number>[]) => {
      setData(newData);
    },
    [],
  );

  const handleConfigChange = useCallback((newConfig: Partial<ChartConfig>) => {
    setConfig((prev) => ({ ...prev, ...newConfig }));
  }, []);

  const handleTypeChange = useCallback((type: ChartType) => {
    setConfig((prev) => ({ ...prev, type }));
  }, []);

  const handleCsvImport = useCallback(
    (importedData: Record<string, string | number>[]) => {
      if (importedData.length > 0) {
        const keys = Object.keys(importedData[0]);
        const xAxisKey = keys[0];
        const series = keys.slice(1).map((key, i) => ({
          dataKey: key,
          name: key,
          color: ["#6366f1", "#ec4899", "#14b8a6", "#f59e0b"][i % 4],
        }));
        setData(importedData);
        setConfig((prev) => ({ ...prev, xAxisKey, series }));
      }
      setShowCsvImporter(false);
    },
    [],
  );

  const handleSave = () => {
    onChange(data, config);
    onClose();
  };

  const headerContent = (
    <div className="flex items-center gap-3">
      <ChartTypeSelector value={config.type} onChange={handleTypeChange} />
      <div className="flex rounded-lg bg-gray-100 dark:bg-slate-800 p-0.5">
        <button
          onClick={() => setMode("table")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-all ${
            mode === "table"
              ? "bg-white dark:bg-slate-700 text-gray-900 dark:text-white shadow-sm"
              : "text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300"
          }`}
        >
          <Table size={14} />
          表格
        </button>
        <button
          onClick={() => setMode("json")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-all ${
            mode === "json"
              ? "bg-white dark:bg-slate-700 text-gray-900 dark:text-white shadow-sm"
              : "text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300"
          }`}
        >
          <Code size={14} />
          JSON
        </button>
      </div>
      <button
        onClick={() => setShowCsvImporter(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
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
        <div className="flex items-center gap-6 text-gray-600 dark:text-slate-300">
          <label className="flex items-center gap-2 cursor-pointer">
            <CustomCheckbox
              checked={config.showGrid ?? true}
              onChange={() =>
                handleConfigChange({ showGrid: !config.showGrid })
              }
              accentColor="#6366f1"
            />
            <span>显示网格</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <CustomCheckbox
              checked={config.showLegend ?? true}
              onChange={() =>
                handleConfigChange({ showLegend: !config.showLegend })
              }
              accentColor="#6366f1"
            />
            <span>显示图例</span>
          </label>
        </div>

        {/* Chart Preview - bottom */}
        <div className="rounded-xl border border-[#f0f0f0] dark:border-[#2a2a2a] p-4 bg-white dark:bg-[#1a1a1a]">
          <div className="text-xs text-gray-400 dark:text-slate-500 mb-3">
            预览
          </div>
          <div className="h-[280px]">
            <ChartPreview data={data} config={config} />
          </div>
        </div>
      </div>

      {showCsvImporter && (
        <CsvImporter
          onImport={handleCsvImport}
          onClose={() => setShowCsvImporter(false)}
        />
      )}
    </CustomModal>
  );
};

export default ChartEditor;
