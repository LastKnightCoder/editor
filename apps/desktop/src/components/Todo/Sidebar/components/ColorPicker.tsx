import { useState, memo } from "react";
import classNames from "classnames";
import { MdAdd } from "react-icons/md";
import {
  PROJECT_COLORS,
  type ProjectColorName,
  getProjectColorValue,
} from "@/constants/project-colors";

interface ColorPickerProps {
  value: ProjectColorName;
  onChange: (color: ProjectColorName) => void;
  theme: "light" | "dark";
}

const ColorPicker = memo(({ value, onChange, theme }: ColorPickerProps) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <div
        className={classNames(
          "w-full h-10 border rounded-lg cursor-pointer flex items-center px-3 transition-all duration-200 bg-white dark:bg-gray-700",
          isOpen
            ? "border-blue-500 ring-1 ring-blue-200 dark:ring-blue-800/50 shadow-sm"
            : "border-gray-200 dark:border-gray-600 hover:border-blue-400",
        )}
        onClick={() => setIsOpen(!isOpen)}
      >
        <div
          className="w-4 h-4 rounded-full mr-2 ring-1 ring-gray-200 dark:ring-gray-500"
          style={{ backgroundColor: getProjectColorValue(value, theme) }}
        />
        <span className="text-sm text-gray-700 dark:text-gray-300 flex-1">
          {PROJECT_COLORS.find((c) => c.name === value)?.label}
        </span>
        <MdAdd
          className={classNames(
            "transform transition-transform duration-200 text-gray-400 dark:text-gray-500 text-xs",
            isOpen ? "rotate-45 text-blue-500 dark:text-blue-400" : "rotate-45",
          )}
        />
      </div>
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-800 rounded-lg shadow-xl border-0 ring-1 ring-gray-200 dark:ring-gray-700 z-20 max-h-60 overflow-y-auto">
            {PROJECT_COLORS.map((color) => (
              <div
                key={color.name}
                className="flex items-center px-3 py-2.5 hover:bg-gray-50/80 dark:hover:bg-gray-700/50 cursor-pointer transition-colors duration-150 first:rounded-t-lg last:rounded-b-lg"
                onClick={() => {
                  onChange(color.name);
                  setIsOpen(false);
                }}
              >
                <div
                  className="w-4 h-4 rounded-full mr-3 ring-1 ring-gray-200 dark:ring-gray-500 shadow-sm"
                  style={{
                    backgroundColor: getProjectColorValue(color.name, theme),
                  }}
                />
                <span className="text-sm text-gray-700 dark:text-gray-300 flex-1">
                  {color.label}
                </span>
                {value === color.name && (
                  <span className="text-blue-500 dark:text-blue-400 text-sm font-medium">
                    ✓
                  </span>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
});

ColorPicker.displayName = "ColorPicker";

export default ColorPicker;
