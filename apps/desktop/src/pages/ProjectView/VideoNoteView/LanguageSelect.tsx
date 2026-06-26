import { useState, useRef } from "react";
import { SelectDropDown } from "@tau/shared";
import { ChevronDown, Check, Globe } from "lucide-react";
import useThemeColors from "@/hooks/useThemeColors";
import classNames from "classnames";

interface LanguageOption {
  value: string;
  label: string;
}

interface LanguageSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: LanguageOption[];
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

const LanguageSelect = ({
  value,
  onChange,
  options,
  disabled = false,
  placeholder = "选择语言",
  className,
}: LanguageSelectProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const themeColors = useThemeColors();

  const selectedOption = options.find((opt) => opt.value === value);
  const displayValue = selectedOption?.label || value || placeholder;
  const hasValue = !!value && !!selectedOption;

  const handleSelect = (option: LanguageOption) => {
    onChange(option.value);
    setIsOpen(false);
  };

  return (
    <div className={classNames("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={classNames(
          "flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium outline-none transition-all",
          themeColors.cardBgClass,
          themeColors.cardBorderClass,
          themeColors.textClass,
          themeColors.hoverClass,
          themeColors.focusBorderClass,
          themeColors.focusRingClass,
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        <Globe
          size={13}
          className={hasValue ? "text-[var(--th-active-text)]" : "opacity-50"}
        />
        <span
          className={classNames(
            "max-w-[7rem] truncate",
            !hasValue && "opacity-50",
          )}
        >
          {displayValue}
        </span>
        <ChevronDown
          size={13}
          className={classNames(
            "shrink-0 opacity-50 transition-transform duration-200",
            isOpen && "rotate-180",
          )}
        />
      </button>

      <SelectDropDown
        items={options}
        selectedKey={value}
        show={isOpen}
        onClose={() => setIsOpen(false)}
        onSelect={handleSelect}
        triggerElement={triggerRef.current}
        getKey={(item) => item.value}
        renderItem={(item) => (
          <div className="flex items-center justify-between gap-3">
            <span className="truncate">{item.label}</span>
            {item.value === value && (
              <Check
                size={14}
                className="shrink-0 text-[var(--th-active-text)]"
              />
            )}
          </div>
        )}
        width={triggerRef.current?.offsetWidth || 220}
        maxHeight={360}
      />
    </div>
  );
};

export default LanguageSelect;
