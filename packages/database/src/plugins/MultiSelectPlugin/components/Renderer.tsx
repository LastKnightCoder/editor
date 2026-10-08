import React, { memo } from "react";
import { CellValue, ColumnDef, SelectOption } from "../../../types";
import SelectList from "../../../views/TableView/components/SelectList";

interface RendererProps {
  value: CellValue;
  column: ColumnDef;
  theme: "light" | "dark";
}

const Renderer: React.FC<RendererProps> = memo(({ value, column }) => {
  if (!value) return null;

  const config = column.config as { options: SelectOption[] };
  const values = Array.isArray(value) ? value : [value];

  if (config?.options && Array.isArray(config.options)) {
    const coloredOptions: SelectOption[] = [];

    values.forEach(val => {
      const option = config.options!.find(opt => opt.id === val);
      if (option) {
        if ((option as SelectOption).color) {
          coloredOptions.push(option);
        }
      }
    });

    return (
      <div className="box-border flex h-full w-full items-center px-2 py-1">
        {coloredOptions.length > 0 && <SelectList options={coloredOptions} />}
      </div>
    );
  }

  return null;
});

export default Renderer;
