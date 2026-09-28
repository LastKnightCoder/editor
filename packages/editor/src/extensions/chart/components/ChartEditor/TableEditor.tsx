import React, { useState, useRef } from "react";
import { Plus, Trash2, ChevronDown } from "lucide-react";
import { SelectDropDown, CustomCheckbox } from "@tau/shared";
import type { ChartConfig } from "../../../../types";

interface TableEditorProps {
  data: Record<string, string | number>[];
  config: ChartConfig;
  onDataChange: (data: Record<string, string | number>[]) => void;
  onConfigChange: (config: Partial<ChartConfig>) => void;
}

const COLORS = ["#6366f1", "#ec4899", "#14b8a6", "#f59e0b", "#8b5cf6", "#06b6d4"];

// 列名编辑组件，使用本地状态避免失焦
const HeaderInput: React.FC<{
  value: string;
  onCommit: (newValue: string) => void;
}> = ({ value, onCommit }) => {
  const [localValue, setLocalValue] = useState(value);
  return (
    <input
      type="text"
      value={localValue}
      onChange={e => setLocalValue(e.target.value)}
      onBlur={() => localValue !== value && onCommit(localValue)}
      onKeyDown={e => e.key === "Enter" && e.currentTarget.blur()}
      className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-sm font-medium outline-none focus:border-indigo-500 focus:bg-white dark:text-slate-200 dark:focus:bg-zinc-700"
    />
  );
};

const TableEditor: React.FC<TableEditorProps> = ({
  data,
  config,
  onDataChange,
  onConfigChange,
}) => {
  const columns = data.length > 0 ? Object.keys(data[0]) : ["name", "value"];
  const [showXAxisDropdown, setShowXAxisDropdown] = useState(false);
  const xAxisTriggerRef = useRef<HTMLButtonElement>(null);

  const updateCell = (rowIndex: number, key: string, value: string) => {
    const newData = [...data];
    const numValue = parseFloat(value);
    newData[rowIndex] = {
      ...newData[rowIndex],
      [key]: isNaN(numValue) ? value : numValue,
    };
    onDataChange(newData);
  };

  const updateHeader = (oldKey: string, newKey: string) => {
    if (oldKey === newKey || !newKey.trim()) return;
    const newData = data.map(row => {
      const newRow: Record<string, string | number> = {};
      for (const key of Object.keys(row)) {
        newRow[key === oldKey ? newKey : key] = row[key];
      }
      return newRow;
    });
    onDataChange(newData);

    if (config.xAxisKey === oldKey) {
      onConfigChange({ xAxisKey: newKey });
    }
    const newSeries = config.series.map(s =>
      s.dataKey === oldKey
        ? { ...s, dataKey: newKey, name: s.name === oldKey ? newKey : s.name }
        : s
    );
    onConfigChange({ series: newSeries });
  };

  const addRow = () => {
    const newRow: Record<string, string | number> = {};
    columns.forEach(col => (newRow[col] = ""));
    onDataChange([...data, newRow]);
  };

  const deleteRow = (index: number) => {
    onDataChange(data.filter((_, i) => i !== index));
  };

  const addColumn = () => {
    const isSingleSeriesType = ["scatter", "pie", "funnel"].includes(config.type);
    if (isSingleSeriesType && config.series.length >= 1) return;

    const newKey = `col${columns.length + 1}`;
    const newData = data.map(row => ({ ...row, [newKey]: 0 }));
    onDataChange(newData);
    onConfigChange({
      series: [
        ...config.series,
        {
          dataKey: newKey,
          name: newKey,
          color: COLORS[config.series.length % COLORS.length],
        },
      ],
    });
  };

  const deleteColumn = (key: string) => {
    if (columns.length <= 2) return;
    const newData = data.map(row => {
      const newRow = { ...row };
      delete newRow[key];
      return newRow;
    });
    onDataChange(newData);
    onConfigChange({
      series: config.series.filter(s => s.dataKey !== key),
      xAxisKey: config.xAxisKey === key ? Object.keys(newData[0])[0] : config.xAxisKey,
    });
  };

  const setXAxisKey = (key: string) => {
    onConfigChange({ xAxisKey: key });
  };

  const toggleSeries = (key: string) => {
    const exists = config.series.some(s => s.dataKey === key);
    if (exists) {
      onConfigChange({
        series: config.series.filter(s => s.dataKey !== key),
      });
    } else {
      onConfigChange({
        series: [
          ...config.series,
          {
            dataKey: key,
            name: key,
            color: COLORS[config.series.length % COLORS.length],
          },
        ],
      });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-[var(--ed-text-secondary)]">
        <span>X 轴:</span>
        <button
          ref={xAxisTriggerRef}
          onClick={() => setShowXAxisDropdown(true)}
          className="flex items-center gap-1 rounded-lg bg-[var(--ed-bg-sunken)] px-3 py-1.5 text-[var(--ed-text)] transition-colors hover:bg-gray-200 dark:hover:bg-zinc-700"
        >
          {config.xAxisKey}
          <ChevronDown size={14} />
        </button>
        <SelectDropDown
          items={columns}
          selectedKey={config.xAxisKey || ""}
          show={showXAxisDropdown}
          onClose={() => setShowXAxisDropdown(false)}
          onSelect={col => setXAxisKey(col)}
          triggerElement={xAxisTriggerRef.current}
          getKey={col => col}
          renderItem={col => <span className="text-sm">{col}</span>}
          width={120}
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-[#f0f0f0] bg-white dark:border-[#2a2a2a] dark:bg-[#141414]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#fafafa] dark:bg-[#1a1a1a]">
                <th className="w-8 border-b border-r border-[#f0f0f0] px-2 py-2 dark:border-[#2a2a2a]" />
                {columns.map(col => (
                  <th
                    key={col}
                    className="border-b border-r border-[#f0f0f0] px-2 py-2 last:border-r-0 dark:border-[#2a2a2a]"
                  >
                    <div className="flex items-center gap-1">
                      <HeaderInput value={col} onCommit={newKey => updateHeader(col, newKey)} />
                      {columns.length > 2 && (
                        <button
                          onClick={() => deleteColumn(col)}
                          className="p-0.5 text-gray-400 opacity-0 hover:text-red-500 group-hover:opacity-100"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                    {col !== config.xAxisKey && (
                      <label className="mt-1 flex items-center gap-1.5 text-sm font-normal text-[var(--ed-text-tertiary)]">
                        <CustomCheckbox
                          checked={config.series.some(s => s.dataKey === col)}
                          onChange={() => toggleSeries(col)}
                          accentColor="#6366f1"
                        />
                        显示
                      </label>
                    )}
                  </th>
                ))}
                <th className="w-8 border-b border-[#f0f0f0] px-2 py-2 dark:border-[#2a2a2a]">
                  <button
                    onClick={addColumn}
                    className="p-1 text-gray-400 transition-colors hover:text-indigo-500"
                  >
                    <Plus size={14} />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, rowIndex) => (
                <tr
                  key={rowIndex}
                  className="group border-b border-[#f0f0f0] last:border-b-0 dark:border-[#2a2a2a]"
                >
                  <td className="border-r border-[#f0f0f0] px-2 py-1.5 text-center text-sm text-[var(--ed-text-tertiary)] dark:border-[#2a2a2a]">
                    {rowIndex + 1}
                  </td>
                  {columns.map(col => (
                    <td
                      key={col}
                      className="border-r border-[#f0f0f0] px-1 py-1 last:border-r-0 dark:border-[#2a2a2a]"
                    >
                      <input
                        type="text"
                        value={row[col] ?? ""}
                        onChange={e => updateCell(rowIndex, col, e.target.value)}
                        className="w-full rounded border border-transparent bg-transparent px-2 py-1 text-sm outline-none focus:border-indigo-500 dark:text-slate-200"
                      />
                    </td>
                  ))}
                  <td className="px-2 py-1.5">
                    <button
                      onClick={() => deleteRow(rowIndex)}
                      className="p-1 text-gray-400 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-[#f0f0f0] bg-[#fafafa] px-2 py-1.5 dark:border-[#2a2a2a] dark:bg-[#1a1a1a]">
          <button
            onClick={addRow}
            className="flex items-center gap-1 px-2 py-1 text-sm text-[var(--ed-text-secondary)] transition-colors hover:text-indigo-500"
          >
            <Plus size={12} />
            添加行
          </button>
        </div>
      </div>
    </div>
  );
};

export default TableEditor;
