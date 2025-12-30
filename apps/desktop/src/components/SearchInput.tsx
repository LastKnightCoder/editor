import { memo, useRef, useState, useEffect, useCallback } from "react";
import { Search, X } from "lucide-react";
import classNames from "classnames";
import { useDebounceFn } from "ahooks";
import { Tooltip } from "antd";
import { useThemeColors } from "@/hooks";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onExpandChange?: (expanded: boolean) => void;
  alwaysExpanded?: boolean;
}

const SearchInput: React.FC<SearchInputProps> = memo(
  ({
    value,
    onChange,
    placeholder = "搜索...",
    onExpandChange,
    alwaysExpanded = false,
  }) => {
    const {
      hoverClass,
      inputBgClass,
      borderClass,
      textClass,
      secondaryTextClass,
    } = useThemeColors();
    const inputRef = useRef<HTMLInputElement>(null);
    const [isExpanded, setIsExpanded] = useState(alwaysExpanded);
    const [localValue, setLocalValue] = useState(value);

    useEffect(() => {
      setLocalValue(value);
    }, [value]);

    const { run: debouncedOnChange } = useDebounceFn(
      (val: string) => {
        onChange(val);
      },
      { wait: 300 },
    );

    const handleInputChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        setLocalValue(newValue);
        debouncedOnChange(newValue);
      },
      [debouncedOnChange],
    );

    const handleExpand = useCallback(() => {
      setIsExpanded(true);
      onExpandChange?.(true);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }, [onExpandChange]);

    const handleClear = useCallback(() => {
      setLocalValue("");
      onChange("");
      inputRef.current?.focus();
    }, [onChange]);

    const handleBlur = useCallback(() => {
      if (!alwaysExpanded && !localValue.trim()) {
        setIsExpanded(false);
        onExpandChange?.(false);
      }
    }, [alwaysExpanded, localValue, onExpandChange]);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Escape") {
          setLocalValue("");
          onChange("");
          if (!alwaysExpanded) {
            setIsExpanded(false);
            onExpandChange?.(false);
            inputRef.current?.blur();
          }
        }
      },
      [alwaysExpanded, onChange, onExpandChange],
    );

    return (
      <div
        className={classNames(
          "relative flex items-center h-9 rounded-full transition-all duration-200 ease-in-out border",
          isExpanded
            ? ["w-48", inputBgClass, borderClass]
            : ["w-9 cursor-pointer border-transparent", hoverClass],
        )}
      >
        {!isExpanded ? (
          <Tooltip title="搜索">
            <div
              className={classNames(
                "w-9 h-9 flex items-center justify-center",
                textClass,
              )}
              onClick={handleExpand}
            >
              <Search className="w-4 h-4" />
            </div>
          </Tooltip>
        ) : (
          <>
            <div
              className={classNames(
                "w-9 h-9 flex items-center justify-center flex-shrink-0",
                secondaryTextClass,
              )}
            >
              <Search className="w-4 h-4" />
            </div>
            <input
              ref={inputRef}
              type="text"
              value={localValue}
              onChange={handleInputChange}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className={classNames(
                "flex-1 h-full bg-transparent text-sm outline-none placeholder:opacity-50 pr-1",
                textClass,
              )}
            />
            {localValue && (
              <div
                className={classNames(
                  "w-7 h-7 flex items-center justify-center cursor-pointer hover:opacity-80 flex-shrink-0 mr-1",
                  secondaryTextClass,
                )}
                onClick={handleClear}
              >
                <X className="w-3.5 h-3.5" />
              </div>
            )}
          </>
        )}
      </div>
    );
  },
);

SearchInput.displayName = "SearchInput";

export default SearchInput;
