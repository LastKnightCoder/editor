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
  if (!value) {
    return null;
  }

  // 查找匹配的选项
  if (config?.options && Array.isArray(config.options)) {
    const option = config.options.find((opt) => opt.id === value);

    if (option) {
      const label = option.name;
      const color = option.color;

      if (color) {
        return (
          <div className="flex items-center h-full w-full px-4">
            <SelectList options={[option]} theme={theme} />
          </div>
        );
      }

      return (
        <div className="flex items-center h-full w-full px-4">
          <span className="inline-block">{label}</span>
        </div>
      );
    }
  }

  return null;
});

export default Renderer;
