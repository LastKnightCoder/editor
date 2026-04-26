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

  const selectedColor = PROJECT_COLORS.find((c) => c.name === value);

  return (
    <div className="relative">
      <div
        ref={triggerRef}
        className={classNames(
          "w-full h-10 border rounded-lg cursor-pointer flex items-center px-3 transition-all duration-200 bg-white dark:bg-zinc-700",
          isOpen
            ? "border-blue-500 ring-1 ring-blue-200 dark:ring-blue-800/50 shadow-sm"
            : "border-gray-200 dark:border-gray-600 hover:border-blue-400",
        )}
        onClick={() => setIsOpen(!isOpen)}
      >
        <div
          className="w-4 h-4 rounded-full mr-2 ring-1 ring-gray-200 dark:ring-gray-500"
          style={{
            backgroundColor: getProjectColorValue(value, theme),
          }}
        />
        <span className="text-sm text-gray-700 dark:text-gray-300 flex-1">
          {selectedColor?.label}
        </span>
        <MdAdd
          className={classNames(
            "transform transition-transform duration-200 text-gray-400 dark:text-gray-500 text-xs",
            isOpen ? "rotate-45 text-blue-500 dark:text-blue-400" : "rotate-45",
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
        getKey={(color) => color.name}
        renderItem={(color) => (
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center">
              <div
                className="w-4 h-4 rounded-full mr-3 ring-1 ring-gray-200 dark:ring-gray-500 shadow-sm"
                style={{
                  backgroundColor: getProjectColorValue(color.name, theme),
                }}
              />
              <span className="text-sm">{color.label}</span>
            </div>
            {value === color.name && (
              <span className="text-blue-500 dark:text-blue-400 text-sm font-medium">
                ✓
              </span>
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
