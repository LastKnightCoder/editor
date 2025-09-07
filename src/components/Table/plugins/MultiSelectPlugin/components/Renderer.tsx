import React, { memo } from "react";
import { CellValue, ColumnDef, SelectOption } from "../../../types";
import SelectList from "../../../components/SelectList";

interface RendererProps {
  value: CellValue;
  config?: {
    options: SelectOption[];
  };
  column: ColumnDef;
  theme: "light" | "dark";
}

const Renderer: React.FC<RendererProps> = memo(({ value, config, theme }) => {
  if (!value) return null;

  const values = Array.isArray(value) ? value : [value];

  if (config?.options && Array.isArray(config.options)) {
    const coloredOptions: SelectOption[] = [];

    values.forEach((val) => {
      const option = config.options!.find((opt) => opt.id === val);
      if (option) {
        if ((option as SelectOption).color) {
          coloredOptions.push(option);
        }
      }
    });

    return (
      <div className="flex items-center w-full h-full box-border py-1 px-4">
        {coloredOptions.length > 0 && (
          <SelectList options={coloredOptions} theme={theme} />
        )}
      </div>
    );
  }

  return null;
});

export default Renderer;
