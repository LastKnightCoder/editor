import React from "react";
import { CellPlugin, CellValue, ColumnDef } from "../../types";
import Star from "@/components/Star";
import { MdStarRate } from "react-icons/md";

interface StarConfig {
  max?: number; // 默认 5
  step?: 0.5 | 1; // 默认 0.5
}

const clamp = (val: number, min: number, max: number) =>
  Math.min(max, Math.max(min, val));

const normalize = (value: CellValue, config?: StarConfig) => {
  const max = Math.max(0, Number(config?.max ?? 5) || 5);
  const step = (config?.step ?? 0.5) === 1 ? 1 : 0.5;
  if (value === null || value === undefined || value === "") return 0;
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return 0;
  const rounded = step === 0.5 ? Math.round(num * 2) / 2 : Math.round(num);
  return clamp(rounded, 0, max);
};

const Renderer: React.FC<{
  value: CellValue;
  column: ColumnDef;
  theme: "light" | "dark";
  readonly: boolean;
  onCellValueChange: (newValue: CellValue) => void;
}> = ({ value, column, theme, readonly, onCellValueChange }) => {
  const config = column.config as StarConfig;
  const max = Math.max(0, Number(config?.max ?? 5) || 5);
  const step = (config?.step ?? 0.5) === 1 ? 1 : 0.5;
  const current = normalize(value, { max, step });

  const handleChange = (v: number | null) => {
    if (readonly) return;
    console.log("handleChange", v);
    onCellValueChange(v ?? 0);
  };

  const onClickContainer = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
  };

  return (
    <div
      className="w-full h-full flex items-center px-2"
      onClick={onClickContainer}
    >
      <Star
        value={current}
        onChange={handleChange}
        max={max}
        step={step}
        readonly={readonly}
        theme={theme}
      />
    </div>
  );
};

const StarPlugin: CellPlugin<StarConfig> = {
  type: "star",
  name: "评分",
  editable: false,
  Renderer,
  Icon: ({ className }) => <MdStarRate className={className} />,
  beforeSave: (value, config) => normalize(value, config),
  afterLoad: (value, config) => normalize(value, config),
};

export default StarPlugin;
