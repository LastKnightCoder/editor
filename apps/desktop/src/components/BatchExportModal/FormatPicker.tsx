import { cn } from "@tau/ui";
import { Check } from "lucide-react";
import type { BatchExportSettings } from "@/types";
import { FORMAT_OPTIONS, type FormatKey } from "./formats";

/** 线框文件图标 + 格式角标，颜色随 currentColor */
const FileTypeIcon = ({ badge }: { badge: string }) => (
  <span className="relative block h-9 w-[30px] shrink-0">
    <svg
      viewBox="0 0 30 36"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinejoin="round"
      aria-hidden
      className="size-full"
    >
      <path
        className="fill-surface"
        d="M5 2.75h13.5L25.25 9.5v22.25a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5V4.25A1.5 1.5 0 0 1 5 2.75Z"
      />
      <path d="M18.5 2.75V9.5h6.75" />
    </svg>
    <span className="font-tau-mono absolute bottom-[7px] left-1/2 -translate-x-1/2 text-[7.5px] font-bold leading-none tracking-[0.02em]">
      {badge}
    </span>
  </span>
);

interface FormatPickerProps {
  formats: BatchExportSettings["formats"];
  onToggle: (key: FormatKey) => void;
}

/** 导出格式多选：选中只描 accent 边并给图标着色，不铺底色 */
const FormatPicker = ({ formats, onToggle }: FormatPickerProps) => (
  <div className="grid grid-cols-4 gap-2">
    {FORMAT_OPTIONS.map(option => {
      const selected = formats[option.key];
      return (
        <button
          key={option.key}
          type="button"
          aria-pressed={selected}
          onClick={() => onToggle(option.key)}
          className={cn(
            "rounded-tau-md bg-surface hover:bg-surface-hover relative flex flex-col gap-2 px-3 pb-[11px] pt-3 text-left",
            "ease-tau-out outline-none transition-[box-shadow,background-color] duration-[140ms]",
            // 边框走 inset-ring，与 focus 的 shadow 叠加而不互相覆盖
            "focus-visible:shadow-[var(--tau-focus-ring)]",
            selected ? "inset-ring-accent inset-ring-[1.5px]" : "inset-ring-line-1 inset-ring"
          )}
        >
          <span
            className={cn(
              "ease-tau-out transition-colors duration-[140ms]",
              selected ? "text-accent" : "text-ink-3"
            )}
          >
            <FileTypeIcon badge={option.badge} />
          </span>
          <span
            aria-hidden
            className={cn(
              "absolute right-2.5 top-2.5 grid size-4 place-items-center rounded-[4.5px] border-[1.5px]",
              selected ? "border-accent bg-accent" : "border-line-1 bg-surface"
            )}
          >
            {selected && <Check className="text-ink-inverse size-3" strokeWidth={2.5} />}
          </span>
          <span className="flex flex-col">
            <span className="text-ink-1 text-tau-body font-semibold">{option.label}</span>
            <span className="text-ink-3 text-tau-micro leading-[1.45]">{option.description}</span>
          </span>
        </button>
      );
    })}
  </div>
);

export default FormatPicker;
