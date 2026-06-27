import { useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { SelectDropDown } from "@tau/shared";
import { useBadgeSelectClass } from "./useInputClass";

export interface BadgeSelectOption<T extends string | number> {
  value: T;
  label: string;
  kind?: string;
}

export interface BadgeSelectProps<T extends string | number> {
  value: T;
  options: BadgeSelectOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  disabled?: boolean;
  width?: number;
  className?: string;
  renderOption?: (option: BadgeSelectOption<T>) => ReactNode;
}

const BadgeSelect = <T extends string | number>({
  value,
  options,
  onChange,
  placeholder = "请选择",
  disabled = false,
  width,
  className,
  renderOption,
}: BadgeSelectProps<T>) => {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selectClass = useBadgeSelectClass();

  const selected = options.find((opt) => opt.value === value);
  const display = selected?.label || value || placeholder;

  return (
    <div className={className}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`${selectClass} flex items-center justify-between ${
          disabled ? "cursor-not-allowed opacity-60" : ""
        }`}
      >
        <span className={!selected ? "opacity-60" : ""}>{display}</span>
        <ChevronDown
          className={`ml-2 h-4 w-4 flex-shrink-0 opacity-50 transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      <SelectDropDown
        items={options}
        selectedKey={value}
        show={isOpen}
        onClose={() => setIsOpen(false)}
        onSelect={(option) => onChange(option.value)}
        triggerElement={triggerRef.current}
        getKey={(option) => option.value}
        renderItem={(option) =>
          renderOption ? renderOption(option) : option.label
        }
        width={width ?? triggerRef.current?.offsetWidth ?? 240}
        maxHeight={400}
      />
    </div>
  );
};

export default BadgeSelect;
