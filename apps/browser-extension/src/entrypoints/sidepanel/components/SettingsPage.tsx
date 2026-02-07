import { useState, useRef } from "react";
import { SelectDropDown } from "@tau/shared";
import type { ThemeMode } from "../../../utils/types";
import { useSettingsStore } from "../../../stores/useSettingsStore";

interface SettingsPageProps {
  themeMode: ThemeMode;
  onThemeModeChange: (mode: ThemeMode) => void;
  onBack: () => void;
}

interface ThemeOption {
  value: ThemeMode;
  label: string;
}

const THEME_OPTIONS: ThemeOption[] = [
  { value: "system", label: "自动" },
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
];

/**
 * 设置页
 * 从右侧滑入的二级页面，参考移动端卡片式设计风格
 */
export default function SettingsPage({
  themeMode,
  onThemeModeChange,
  onBack,
}: SettingsPageProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { autoSummaryEnabled, setAutoSummaryEnabled } = useSettingsStore();

  const selectedLabel =
    THEME_OPTIONS.find((o) => o.value === themeMode)?.label ?? "自动";

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex h-12 flex-shrink-0 items-center gap-3 border-b border-gray-100 px-4 dark:border-[#21262d]">
        <button
          onClick={onBack}
          className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-black/5 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-[#e6edf3]"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"
            />
          </svg>
        </button>
        <span className="text-base font-semibold text-gray-900 dark:text-[#e6edf3]">
          设置
        </span>
      </header>

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* 分组标题 */}
        <h2 className="mb-3 text-lg font-medium text-gray-900 dark:text-[#e6edf3]">
          通用
        </h2>

        {/* 设置项卡片 */}
        <div className="rounded-xl border border-gray-200 dark:border-[#30363d]">
          {/* 外观设置行 */}
          <div className="flex items-center justify-between px-4 py-3.5">
            <span className="text-sm text-gray-700 dark:text-gray-300">
              外观
            </span>
            <button
              ref={triggerRef}
              type="button"
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-200 dark:bg-[#21262d] dark:text-gray-300 dark:hover:bg-[#30363d]"
            >
              <span>{selectedLabel}</span>
              <svg
                className={`h-4 w-4 text-gray-400 transition-transform dark:text-gray-500 ${dropdownOpen ? "rotate-180" : ""}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>

            <SelectDropDown
              items={THEME_OPTIONS}
              selectedKey={themeMode}
              show={dropdownOpen}
              onClose={() => setDropdownOpen(false)}
              onSelect={(item) => onThemeModeChange(item.value)}
              triggerElement={triggerRef.current}
              getKey={(item) => item.value}
              renderItem={(item) => item.label}
              width={triggerRef.current?.offsetWidth || 120}
            />
          </div>

          {/* 自动总结设置行 */}
          <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3.5 dark:border-[#30363d]">
            <div className="flex flex-col">
              <span className="text-sm text-gray-700 dark:text-gray-300">
                自动总结网页
              </span>
              <span className="text-xs text-gray-400 dark:text-gray-500">
                URL 变化时自动分析页面内容
              </span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={autoSummaryEnabled}
              onClick={() => setAutoSummaryEnabled(!autoSummaryEnabled)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                autoSummaryEnabled
                  ? "bg-blue-500"
                  : "bg-gray-200 dark:bg-gray-700"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  autoSummaryEnabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
