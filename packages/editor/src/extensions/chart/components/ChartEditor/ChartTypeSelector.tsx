import React, { useState, useRef } from "react";
import { motion } from "motion/react";
import { ChevronDown } from "lucide-react";
import {
  BarChart2,
  LineChart,
  PieChart,
  AreaChart,
  ScatterChart,
  Radar,
  Filter,
} from "lucide-react";
import type { ChartType } from "../../../../types";
import { useClickAway } from "ahooks";

interface ChartTypeSelectorProps {
  value: ChartType;
  onChange: (type: ChartType) => void;
}

const chartTypes: {
  type: ChartType;
  label: string;
  icon: React.ElementType;
}[] = [
  { type: "bar", label: "柱状图", icon: BarChart2 },
  { type: "line", label: "折线图", icon: LineChart },
  { type: "pie", label: "饼图", icon: PieChart },
  { type: "area", label: "面积图", icon: AreaChart },
  { type: "scatter", label: "散点图", icon: ScatterChart },
  { type: "radar", label: "雷达图", icon: Radar },
  { type: "funnel", label: "漏斗图", icon: Filter },
];

const ChartTypeSelector: React.FC<ChartTypeSelectorProps> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useClickAway(() => setOpen(false), ref);

  const current = chartTypes.find(t => t.type === value) || chartTypes[0];
  const Icon = current.icon;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg bg-[var(--ed-bg-sunken)] px-3 py-1.5 transition-colors hover:bg-gray-200 dark:hover:bg-zinc-700"
      >
        <Icon size={16} className="text-indigo-500" />
        <span className="text-sm text-[var(--ed-text)]">{current.label}</span>
        <ChevronDown
          size={14}
          className={`text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.15 }}
          className="absolute left-0 top-full z-50 mt-1 min-w-[140px] overflow-hidden rounded-xl border border-[var(--ed-border)] bg-white/80 shadow-lg backdrop-blur-md dark:bg-[rgba(30,30,30,0.8)]"
        >
          {chartTypes.map(item => {
            const ItemIcon = item.icon;
            return (
              <button
                key={item.type}
                onClick={() => {
                  onChange(item.type);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors ${
                  item.type === value
                    ? "bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400"
                    : "text-[var(--ed-text)] hover:bg-gray-100 dark:hover:bg-zinc-700"
                }`}
              >
                <ItemIcon size={16} />
                {item.label}
              </button>
            );
          })}
        </motion.div>
      )}
    </div>
  );
};

export default ChartTypeSelector;
