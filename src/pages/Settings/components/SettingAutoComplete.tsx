import React, { useState, useRef, useEffect } from "react";

interface SettingAutoCompleteProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

const SettingAutoComplete: React.FC<SettingAutoCompleteProps> = ({
  label,
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
  className = "",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [filteredOptions, setFilteredOptions] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value) {
      const filtered = options.filter((option) =>
        option.toLowerCase().includes(value.toLowerCase()),
      );
      setFilteredOptions(filtered.slice(0, 50));
    } else {
      setFilteredOptions(options.slice(0, 50));
    }
  }, [value, options]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className={`flex flex-col gap-1.5 relative ${className}`}>
      {label && (
        <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
          {label}
        </label>
      )}
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setIsOpen(true)}
        placeholder={placeholder}
        disabled={disabled}
        className={`w-full px-4 py-3.5 rounded-xl text-sm outline-none transition-all
          bg-gray-50 dark:bg-slate-950
          border border-gray-200 dark:border-slate-700
          text-gray-800 dark:text-white
          shadow-inner
          placeholder:text-gray-400 dark:placeholder:text-slate-500
          focus:border-blue-500 focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(59,130,246,0.15)]
          dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(59,130,246,0.25)]
          disabled:opacity-60 disabled:cursor-not-allowed`}
      />
      {isOpen && filteredOptions.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute top-full left-0 right-0 mt-1 z-50
            max-h-60 overflow-y-auto
            rounded-xl
            bg-white dark:bg-slate-900
            border border-gray-200 dark:border-slate-700
            shadow-lg"
        >
          {filteredOptions.map((option, index) => (
            <button
              key={index}
              type="button"
              className="w-full px-4 py-2.5 text-left text-sm
                text-gray-800 dark:text-white
                hover:bg-gray-100 dark:hover:bg-slate-800
                first:rounded-t-xl last:rounded-b-xl
                transition-colors"
              onClick={() => {
                onChange(option);
                setIsOpen(false);
              }}
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default SettingAutoComplete;
