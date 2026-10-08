import React, { memo } from "react";
import { CellValue, ColumnDef, SelectOption } from "../../../types";
import SelectList from "../../../views/TableView/components/SelectList";

interface RendererProps {
  value: CellValue;
  column: ColumnDef;
  theme: "light" | "dark";
}

const Renderer: React.FC<RendererProps> = memo(({ value, column }) => {
  if (!value) {
    return null;
  }

  const config = column.config as { options: SelectOption[] };

  // 查找匹配的选项
  if (config?.options && Array.isArray(config.options)) {
    const option = config.options.find(opt => opt.id === value);

    if (option) {
      const label = option.name;
      const color = option.color;

      if (color) {
        return (
          <div className="flex h-full w-full items-center px-2">
            <SelectList options={[option]} />
          </div>
        );
      }

      return (
        <div className="flex h-full w-full items-center px-2">
          <span className="inline-block">{label}</span>
        </div>
      );
    }
  }

  return null;
});

export default Renderer;
