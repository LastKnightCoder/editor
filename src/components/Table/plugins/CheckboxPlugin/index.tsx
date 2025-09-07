import React from "react";
import { CellPlugin, CellValue, ColumnDef } from "../../types";
import CustomCheckbox from "@/components/CustomCheckbox";
import { MdCheckBox } from "react-icons/md";

const Renderer: React.FC<{
  value: CellValue;
  config?: unknown;
  column: ColumnDef;
  theme: "light" | "dark";
  readonly: boolean;
  onCellValueChange?: (newValue: CellValue) => void;
}> = ({ value, readonly, onCellValueChange }) => {
  const checked = Boolean(value);

  const handleToggle = () => {
    if (readonly) return;
    onCellValueChange?.(!checked);
  };

  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
    handleToggle();
  };

  const onDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
  };

  return (
    <div
      className="w-full h-full flex items-center px-4"
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      <CustomCheckbox checked={checked} onChange={handleToggle} />
    </div>
  );
};

const CheckboxPlugin: CellPlugin<unknown> = {
  type: "checkbox",
  name: "复选框",
  editable: false,
  Renderer,
  Icon: ({ className }) => <MdCheckBox className={className} />,
  beforeSave: (value) => Boolean(value),
  afterLoad: (value) => Boolean(value),
};

export default CheckboxPlugin;
