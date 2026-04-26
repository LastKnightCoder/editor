import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";
import useThemeColors from "@/hooks/useThemeColors";

type FontPickerKind = "chinese" | "english" | "code";

interface SettingFontPickerProps {
  label?: string;
  description?: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  kind: FontPickerKind;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  maxHeight?: number;
}

interface FloatingPosition {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

const FONT_PREVIEW_TEXT: Record<FontPickerKind, string> = {
  chinese: "春风又绿江南岸",
  english: "Sphinx of black quartz, judge my vow.",
  code: "const preview = (font: string) => font;",
};

const FONT_PLACEHOLDER: Record<FontPickerKind, string> = {
  chinese: "搜索中文字体...",
  english: "搜索字体名称...",
  code: "搜索代码字体...",
};

const getPreviewFontFamily = (font: string, kind: FontPickerKind) => {
  if (kind === "chinese") {
    return `"${font}", "PingFang SC", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif`;
  }

  if (kind === "code") {
    return `"${font}", "SF Mono", "JetBrains Mono", "Fira Code", monospace`;
  }

  return `"${font}", "Helvetica Neue", Arial, sans-serif`;
};

const SettingFontPicker: React.FC<SettingFontPickerProps> = ({
  label,
  description,
  value,
  onChange,
  options,
  kind,
  placeholder,
  disabled = false,
  className = "",
  maxHeight = 400,
}) => {
  const themeColors = useThemeColors();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [position, setPosition] = useState<FloatingPosition>({
    top: 0,
    left: 0,
    width: 320,
    maxHeight: Math.min(maxHeight + 88, 480),
  });

  const previewText = FONT_PREVIEW_TEXT[kind];
  const searchPlaceholder = placeholder || FONT_PLACEHOLDER[kind];

  const filteredOptions = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) {
      return options;
    }

    return options.filter((option) => option.toLowerCase().includes(keyword));
  }, [options, search]);

  const selectedIndex = useMemo(
    () => filteredOptions.findIndex((option) => option === value),
    [filteredOptions, value],
  );

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) {
      return;
    }

    const rect = trigger.getBoundingClientRect();
    const gap = 8;
    const searchAreaHeight = 88;
    const minListHeight = 72;
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const width = Math.max(rect.width, 360);
    const spaceBelow = viewportHeight - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    const desiredHeight = Math.min(
      maxHeight + searchAreaHeight,
      viewportHeight - gap * 2,
    );
    const minimumHeight = minListHeight + searchAreaHeight;
    const canFullyPlaceBelow = spaceBelow >= desiredHeight;
    const canFullyPlaceAbove = spaceAbove >= desiredHeight;

    let placeBelow = true;
    if (canFullyPlaceBelow && !canFullyPlaceAbove) {
      placeBelow = true;
    } else if (canFullyPlaceAbove && !canFullyPlaceBelow) {
      placeBelow = false;
    } else if (canFullyPlaceBelow && canFullyPlaceAbove) {
      placeBelow = true;
    } else {
      placeBelow = spaceBelow >= spaceAbove;
    }

    const availableHeight = Math.min(
      placeBelow ? spaceBelow : spaceAbove,
      viewportHeight - gap * 2,
    );
    const panelMaxHeight = Math.max(
      Math.min(desiredHeight, availableHeight),
      Math.min(minimumHeight, availableHeight),
    );
    const top = placeBelow
      ? rect.bottom + gap
      : Math.max(gap, rect.top - panelMaxHeight - gap);
    const left = Math.min(
      Math.max(gap, rect.left),
      Math.max(gap, viewportWidth - width - gap),
    );

    setPosition({
      top,
      left,
      width,
      maxHeight: panelMaxHeight,
    });
  }, [maxHeight]);

  const closePanel = useCallback(() => {
    setIsOpen(false);
    setSearch("");
  }, []);

  const openPanel = useCallback(() => {
    if (disabled) {
      return;
    }

    setIsOpen(true);
    setSearch("");
    const nextIndex = options.findIndex((option) => option === value);
    setHighlightedIndex(nextIndex >= 0 ? nextIndex : 0);
  }, [disabled, options, value]);

  const selectOption = useCallback(
    (font: string) => {
      onChange(font);
      closePanel();
      requestAnimationFrame(() => {
        triggerRef.current?.focus();
      });
    },
    [closePanel, onChange],
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    updatePosition();
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        panelRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }
      closePanel();
    };

    const handleWindowChange = () => {
      updatePosition();
    };

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("resize", handleWindowChange);
    window.addEventListener("scroll", handleWindowChange, true);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("resize", handleWindowChange);
      window.removeEventListener("scroll", handleWindowChange, true);
    };
  }, [closePanel, isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    updatePosition();
    setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0);

    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
  }, [isOpen, selectedIndex, updatePosition]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (filteredOptions.length === 0) {
      setHighlightedIndex(0);
      return;
    }

    setHighlightedIndex((current) =>
      Math.min(Math.max(current, 0), filteredOptions.length - 1),
    );
  }, [filteredOptions.length, isOpen]);

  useEffect(() => {
    if (!isOpen || filteredOptions.length === 0) {
      return;
    }

    optionRefs.current[highlightedIndex]?.scrollIntoView?.({
      block: "nearest",
    });
  }, [filteredOptions.length, highlightedIndex, isOpen]);

  const handleTriggerKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
  ) => {
    if (disabled) {
      return;
    }

    if (
      event.key === "Enter" ||
      event.key === " " ||
      event.key === "ArrowDown"
    ) {
      event.preventDefault();
      openPanel();
    }
  };

  const handleSearchKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closePanel();
      requestAnimationFrame(() => {
        triggerRef.current?.focus();
      });
      return;
    }

    if (!filteredOptions.length) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((current) =>
        Math.min(current + 1, filteredOptions.length - 1),
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((current) => Math.max(current - 1, 0));
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      selectOption(filteredOptions[highlightedIndex]);
    }
  };

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label className="text-sm font-medium text-gray-800 dark:text-gray-200">
          {label}
        </label>
      )}
      {description && (
        <div className="text-xs text-gray-500 dark:text-gray-400 -mt-1 mb-1">
          {description}
        </div>
      )}

      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => (isOpen ? closePanel() : openPanel())}
        onKeyDown={handleTriggerKeyDown}
        className={`w-full rounded-xl border px-4 py-3 text-left transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
          themeColors.inputBgClass
        } border-gray-200 dark:border-slate-700 ${themeColors.focusBorderClass} ${
          themeColors.focusRingClass
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-base font-semibold text-gray-900 dark:text-white">
              {value || searchPlaceholder}
            </div>
            <div
              className={`mt-1 truncate text-sm ${
                kind === "code"
                  ? "text-zinc-500 dark:text-zinc-400"
                  : "text-gray-500 dark:text-zinc-400"
              }`}
              style={{
                fontFamily: getPreviewFontFamily(value || "inherit", kind),
              }}
            >
              {previewText}
            </div>
          </div>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-gray-400 transition-transform dark:text-slate-500 ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        </div>
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={panelRef}
            className="fixed z-[9999] overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/96 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl"
            style={{
              top: position.top,
              left: position.left,
              width: position.width,
              maxHeight: position.maxHeight,
            }}
          >
            <div className="border-b border-zinc-800 px-3 py-3">
              <div className="flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5">
                <Search className="h-4 w-4 text-zinc-500" />
                <input
                  ref={searchInputRef}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder={searchPlaceholder}
                  className="w-full bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
                />
              </div>
            </div>

            <div
              className="overflow-y-auto px-2 py-2"
              style={{ maxHeight: Math.max(72, position.maxHeight - 88) }}
              role="listbox"
            >
              {filteredOptions.length > 0 ? (
                filteredOptions.map((font, index) => {
                  const isSelected = font === value;
                  const isHighlighted = index === highlightedIndex;

                  return (
                    <button
                      key={font}
                      ref={(node) => {
                        optionRefs.current[index] = node;
                      }}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onMouseEnter={() => setHighlightedIndex(index)}
                      onClick={() => selectOption(font)}
                      className={`mb-1 flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-all last:mb-0 ${
                        isHighlighted || isSelected
                          ? "border-zinc-600 bg-zinc-800/80"
                          : "border-transparent bg-transparent hover:border-zinc-700 hover:bg-zinc-800/55"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div
                          className={`truncate ${
                            kind === "code"
                              ? "text-[13px] text-zinc-300"
                              : "text-lg text-zinc-100"
                          }`}
                          style={{
                            fontFamily: getPreviewFontFamily(font, kind),
                          }}
                        >
                          {previewText}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 pl-2">
                        <span className="max-w-[150px] truncate text-sm font-medium text-zinc-300">
                          {font}
                        </span>
                        {isSelected && (
                          <Check className="h-4 w-4 text-zinc-100" />
                        )}
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="px-3 py-6 text-center text-sm text-zinc-500">
                  没有匹配的字体
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};

export type { FontPickerKind };
export default SettingFontPicker;
