import { useState, useRef, memo } from "react";
import classNames from "classnames";
import { MdAdd } from "react-icons/md";
import {
  PROJECT_COLORS,
  type ProjectColorName,
  getProjectColorValue,
  type ProjectColor,
} from "@/constants/project-colors";
import { SelectDropDown } from "@tau/shared";

interface ColorPickerProps {
  value: ProjectColorName;
  onChange: (color: ProjectColorName) => void;
  theme: "light" | "dark";
}

const ColorPicker = memo(({ value, onChange, theme }: ColorPickerProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);

  const selectedColor = PROJECT_COLORS.find(c => c.name === value);

  return (
    <div className="relative">
      <div
        ref={triggerRef}
        className={classNames(
          "flex h-10 w-full cursor-pointer items-center rounded-lg border bg-white px-3 transition-all duration-200 dark:bg-zinc-700",
          isOpen
            ? "border-blue-500 shadow-sm ring-1 ring-blue-200 dark:ring-blue-800/50"
            : "border-gray-200 hover:border-[var(--th-border-hover)] dark:border-gray-600"
        )}
        onClick={() => setIsOpen(!isOpen)}
      >
        <div
          className="mr-2 h-4 w-4 rounded-full ring-1 ring-gray-200 dark:ring-gray-500"
          style={{
            backgroundColor: getProjectColorValue(value, theme),
          }}
        />
        <span className="flex-1 text-sm text-gray-700 dark:text-gray-300">
          {selectedColor?.label}
        </span>
        <MdAdd
          className={classNames(
            "transform text-xs text-gray-400 transition-transform duration-200 dark:text-gray-500",
            isOpen ? "rotate-45 text-[var(--th-accent)]" : "rotate-45"
          )}
        />
      </div>

      <SelectDropDown
        items={PROJECT_COLORS}
        selectedKey={value}
        show={isOpen}
        onClose={() => setIsOpen(false)}
        onSelect={(color: ProjectColor) => onChange(color.name)}
        triggerElement={triggerRef.current}
        getKey={color => color.name}
        renderItem={color => (
          <div className="flex w-full items-center justify-between">
            <div className="flex items-center">
              <div
                className="mr-3 h-4 w-4 rounded-full shadow-sm ring-1 ring-gray-200 dark:ring-gray-500"
                style={{
                  backgroundColor: getProjectColorValue(color.name, theme),
                }}
              />
              <span className="text-sm">{color.label}</span>
            </div>
            {value === color.name && (
              <span className="text-sm font-medium text-[var(--th-accent)]">✓</span>
            )}
          </div>
        )}
        width={triggerRef.current?.offsetWidth || 240}
        maxHeight={300}
      />
    </div>
  );
});

ColorPicker.displayName = "ColorPicker";

export default ColorPicker;
