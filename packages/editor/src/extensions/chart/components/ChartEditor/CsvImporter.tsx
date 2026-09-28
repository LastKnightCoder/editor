import React, { useState, useRef, useCallback } from "react";
import { motion } from "motion/react";
import { Upload, X, FileText } from "lucide-react";

interface CsvImporterProps {
  onImport: (data: Record<string, string | number>[]) => void;
  onClose: () => void;
}

const CsvImporter: React.FC<CsvImporterProps> = ({ onImport, onClose }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parseCsv = useCallback((text: string): Record<string, string | number>[] => {
    const lines = text.trim().split("\n");
    if (lines.length < 2) throw new Error("CSV 至少需要包含表头和一行数据");

    const headers = lines[0].split(",").map(h => h.trim().replace(/^["']|["']$/g, ""));
    const data: Record<string, string | number>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(",").map(v => v.trim().replace(/^["']|["']$/g, ""));
      const row: Record<string, string | number> = {};
      headers.forEach((header, j) => {
        const value = values[j] || "";
        const numValue = parseFloat(value);
        row[header] = isNaN(numValue) ? value : numValue;
      });
      data.push(row);
    }

    return data;
  }, []);

  const handleFile = useCallback(
    (file: File) => {
      if (!file.name.endsWith(".csv")) {
        setError("请选择 CSV 文件");
        return;
      }

      const reader = new FileReader();
      reader.onload = e => {
        try {
          const text = e.target?.result as string;
          const data = parseCsv(text);
          onImport(data);
        } catch (err) {
          setError(err instanceof Error ? err.message : "解析失败");
        }
      };
      reader.readAsText(file);
    },
    [parseCsv, onImport]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        className="mx-4 w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-zinc-900"
      >
        <div className="flex items-center justify-between border-b border-[var(--ed-border)] px-5 py-4">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">导入 CSV</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-zinc-800 dark:hover:text-slate-300"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-5">
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`flex h-40 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed transition-all ${
              isDragging
                ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20"
                : "border-[var(--ed-border)] hover:border-gray-400 dark:hover:border-slate-500"
            }`}
          >
            <Upload
              size={32}
              className={`mb-2 ${isDragging ? "text-indigo-500" : "text-gray-400"}`}
            />
            <p className="text-sm text-[var(--ed-text-secondary)]">
              拖拽 CSV 文件到此处，或点击选择
            </p>
            <p className="mt-1 text-xs text-[var(--ed-text-tertiary)]">
              第一行为列名，后续行为数据
            </p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
            className="hidden"
          />

          {error && (
            <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}

          <div className="mt-4 rounded-lg bg-gray-50 p-3 dark:bg-zinc-800">
            <div className="mb-2 flex items-center gap-2 text-xs text-[var(--ed-text-secondary)]">
              <FileText size={14} />
              CSV 格式示例
            </div>
            <pre className="font-mono text-xs text-[var(--ed-text-secondary)]">
              {`name,value,count
A,100,50
B,200,80
C,150,60`}
            </pre>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default CsvImporter;
