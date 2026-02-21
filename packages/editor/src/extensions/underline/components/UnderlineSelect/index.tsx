import { memo } from "react";
import { For } from "@tau/shared";
import UnderlineSelectItem from "./UnderlineSelectItem";

const underlineColors = [
  {
    label: "默认",
    value: "default",
  },
  {
    label: "黄色",
    value: "yellow",
  },
  {
    label: "绿色",
    value: "green",
  },
  {
    label: "蓝色",
    value: "blue",
  },
  {
    label: "紫色",
    value: "purple",
  },
  {
    label: "红色",
    value: "red",
  },
];

const lineTypes = [
  {
    label: "实线",
    value: "solid" as const,
  },
  {
    label: "虚线",
    value: "dashed" as const,
  },
  {
    label: "点线",
    value: "dotted" as const,
  },
  {
    label: "波浪线",
    value: "wavy" as const,
  },
];

interface IUnderlineSelectProps {
  selectedColor: string;
  selectedLineType: "solid" | "dashed" | "dotted" | "wavy";
  onColorSelect: (color: string) => void;
  onLineTypeSelect: (lineType: "solid" | "dashed" | "dotted" | "wavy") => void;
}

const UnderlineSelect = memo((props: IUnderlineSelectProps) => {
  const { selectedColor, selectedLineType, onColorSelect, onLineTypeSelect } =
    props;

  return (
    <div
      className={
        "flex flex-col gap-3 px-4 py-3 rounded-2xl min-w-[220px] " +
        "max-w-[calc(100vw-24px)] max-h-[calc(100vh-24px)] overflow-x-hidden overflow-y-auto " +
        "relative z-[10060] bg-white/90 dark:bg-slate-900/85 border " +
        "border-white/40 dark:border-white/10 backdrop-blur-2xl " +
        "backdrop-saturate-150 shadow-[0_18px_45px_rgba(15,23,42,0.25)] " +
        "dark:shadow-[0_22px_60px_rgba(2,6,23,0.7)]"
      }
    >
      <div className="flex flex-col gap-2">
        <div className="text-xs font-semibold text-slate-500 dark:text-slate-200 px-1">
          颜色
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <For
            data={underlineColors}
            renderItem={(color) => (
              <UnderlineSelectItem
                type="color"
                color={color.value}
                label={color.label}
                onClick={onColorSelect}
                isSelected={selectedColor === color.value}
              />
            )}
          />
        </div>
      </div>

      <div className="h-px w-full bg-slate-200/90 dark:bg-slate-700/60" />

      <div className="flex flex-col gap-2">
        <div className="text-xs font-semibold text-slate-500 dark:text-slate-200 px-1">
          线型
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <For
            data={lineTypes}
            renderItem={(lineType) => (
              <UnderlineSelectItem
                type="lineType"
                lineType={lineType.value}
                label={lineType.label}
                onClick={onLineTypeSelect}
                isSelected={selectedLineType === lineType.value}
                currentColor={selectedColor}
              />
            )}
          />
        </div>
      </div>
    </div>
  );
});

export default UnderlineSelect;
