import { FC, useMemo } from "react";
import type { ColumnDef } from "./types";
import { Select } from "@tau/ui";

interface ColumnDropdownProps {
  columns: ColumnDef[];
  selectedId?: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
  placeholder?: string;
  allowClear?: boolean;
  label?: string;
}

const ColumnDropdown: FC<ColumnDropdownProps> = ({
  columns,
  selectedId,
  onSelect,
  disabled = false,
  placeholder = "选择列",
  allowClear = false,
  label,
}) => {
  const options = useMemo(
    () => [
      ...(allowClear ? [{ value: "", label: "无" }] : []),
      ...columns.map(col => ({ value: col.id, label: col.title })),
    ],
    [columns, allowClear]
  );

  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-tau-micro text-ink-2 font-medium">{label}</label>}
      <Select
        value={selectedId ?? null}
        onValueChange={onSelect}
        options={options}
        placeholder={placeholder}
        disabled={disabled}
        emptyText="暂无可选列"
        className="w-full"
      />
    </div>
  );
};

export default ColumnDropdown;
