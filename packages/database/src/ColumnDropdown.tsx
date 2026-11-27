import { FC, useMemo } from "react";
import type { ColumnDef } from "./types";
import { Select } from "@tau/ui";
import { useDatabaseI18n } from "./i18n";

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
  placeholder,
  allowClear = false,
  label,
}) => {
  const { t } = useDatabaseI18n();
  const options = useMemo(
    () => [
      ...(allowClear ? [{ value: "", label: t("common.none") }] : []),
      ...columns.map(col => ({ value: col.id, label: col.title })),
    ],
    [columns, allowClear, t]
  );

  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-tau-micro text-ink-2 font-medium">{label}</label>}
      <Select
        value={selectedId ?? null}
        onValueChange={onSelect}
        options={options}
        placeholder={placeholder ?? t("columnPicker.placeholder")}
        disabled={disabled}
        emptyText={t("columnPicker.empty")}
        className="w-full"
      />
    </div>
  );
};

export default ColumnDropdown;
