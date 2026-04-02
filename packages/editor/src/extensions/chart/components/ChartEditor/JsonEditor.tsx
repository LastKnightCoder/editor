import React, { useState, useEffect } from "react";
import type { ChartConfig } from "../../../../types";

interface JsonEditorProps {
  data: Record<string, string | number>[];
  config: ChartConfig;
  onDataChange: (data: Record<string, string | number>[]) => void;
  onConfigChange: (config: Partial<ChartConfig>) => void;
}

const JsonEditor: React.FC<JsonEditorProps> = ({
  data,
  config,
  onDataChange,
  onConfigChange,
}) => {
  const [dataText, setDataText] = useState(JSON.stringify(data, null, 2));
  const [configText, setConfigText] = useState(JSON.stringify(config, null, 2));
  const [dataError, setDataError] = useState<string | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);

  useEffect(() => {
    setDataText(JSON.stringify(data, null, 2));
  }, [data]);

  useEffect(() => {
    setConfigText(JSON.stringify(config, null, 2));
  }, [config]);

  const handleDataChange = (text: string) => {
    setDataText(text);
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        onDataChange(parsed);
        setDataError(null);
      } else {
        setDataError("数据必须是数组");
      }
    } catch {
      setDataError("JSON 格式错误");
    }
  };

  const handleConfigChange = (text: string) => {
    setConfigText(text);
    try {
      const parsed = JSON.parse(text);
      onConfigChange(parsed);
      setConfigError(null);
    } catch {
      setConfigError("JSON 格式错误");
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-gray-500 dark:text-slate-400">
            数据
          </label>
          {dataError && (
            <span className="text-xs text-red-500">{dataError}</span>
          )}
        </div>
        <textarea
          value={dataText}
          onChange={(e) => handleDataChange(e.target.value)}
          className={`w-full h-48 px-3 py-2 text-sm font-mono rounded-xl outline-none transition-all resize-none
            bg-gray-50 dark:bg-zinc-900 border
            ${
              dataError
                ? "border-red-300 dark:border-red-700"
                : "border-gray-200 dark:border-slate-700 focus:border-indigo-500"
            }`}
          spellCheck={false}
        />
      </div>
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-gray-500 dark:text-slate-400">
            配置
          </label>
          {configError && (
            <span className="text-xs text-red-500">{configError}</span>
          )}
        </div>
        <textarea
          value={configText}
          onChange={(e) => handleConfigChange(e.target.value)}
          className={`w-full h-32 px-3 py-2 text-sm font-mono rounded-xl outline-none transition-all resize-none
            bg-gray-50 dark:bg-zinc-900 border
            ${
              configError
                ? "border-red-300 dark:border-red-700"
                : "border-gray-200 dark:border-slate-700 focus:border-indigo-500"
            }`}
          spellCheck={false}
        />
      </div>
    </div>
  );
};

export default JsonEditor;
