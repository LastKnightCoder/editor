import React, { useState, useRef } from "react";
import SelectDropDown from "@/components/SelectDropDown";
import useThemeColors from "@/hooks/useThemeColors";

interface SettingDropdownOption {
  label: string;
  value: string;
}

interface SettingDropdownProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: (string | SettingDropdownOption)[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  width?: number;
  maxHeight?: number;
}

const SettingDropdown: React.FC<SettingDropdownProps> = ({
  label,
  value,
  onChange,
  options,
  placeholder = "请选择",
  disabled = false,
  className = "",
  width = 240,
  maxHeight = 400,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const themeColors = useThemeColors();

  // 将选项统一转换为对象格式
  const normalizedOptions: SettingDropdownOption[] = options.map((opt) =>
    typeof opt === "string" ? { label: opt, value: opt } : opt,
  );

  // 获取当前选中项的显示文本
  const selectedOption = normalizedOptions.find((opt) => opt.value === value);
  const displayValue = selectedOption?.label || value || placeholder;

  const handleSelect = (option: SettingDropdownOption) => {
    onChange(option.value);
  };

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
          {label}
        </label>
      )}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`w-full px-4 py-3.5 rounded-xl text-sm outline-none transition-all
          ${themeColors.inputBgClass}
          border border-gray-200 dark:border-slate-700
          text-gray-800 dark:text-white
          shadow-inner
          ${themeColors.focusBorderClass} ${themeColors.focusRingClass}
          disabled:opacity-60 disabled:cursor-not-allowed
          text-left flex items-center justify-between`}
      >
        <span className={!value ? "text-gray-400 dark:text-slate-500" : ""}>
          {displayValue}
        </span>
        <svg
          className={`w-4 h-4 transition-transform text-gray-400 dark:text-slate-500 ${
            isOpen ? "rotate-180" : ""
          }`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      <SelectDropDown
        items={normalizedOptions}
        selectedKey={value}
        show={isOpen}
        onClose={() => setIsOpen(false)}
        onSelect={handleSelect}
        triggerElement={triggerRef.current}
        getKey={(item) => item.value}
        renderItem={(item) => item.label}
        width={triggerRef.current?.offsetWidth || width}
        maxHeight={maxHeight}
      />
    </div>
  );
};

export default SettingDropdown;
