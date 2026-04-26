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

const ChartTypeSelector: React.FC<ChartTypeSelectorProps> = ({
  value,
  onChange,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useClickAway(() => setOpen(false), ref);

  const current = chartTypes.find((t) => t.type === value) || chartTypes[0];
  const Icon = current.icon;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors"
      >
        <Icon size={16} className="text-indigo-500" />
        <span className="text-sm text-gray-700 dark:text-slate-300">
          {current.label}
        </span>
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
          className="absolute top-full left-0 mt-1 z-50 min-w-[140px] rounded-xl bg-white/80 dark:bg-[rgba(30,30,30,0.8)] backdrop-blur-md border border-gray-200 dark:border-slate-700 shadow-lg overflow-hidden"
        >
          {chartTypes.map((item) => {
            const ItemIcon = item.icon;
            return (
              <button
                key={item.type}
                onClick={() => {
                  onChange(item.type);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                  item.type === value
                    ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400"
                    : "text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-zinc-700"
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
