import React, { memo, useEffect, useRef, useState } from "react";
import dayjs from "dayjs";
import { DatePicker, DateRangePicker } from "@tau/ui";

import { CellValue, ColumnDef } from "../../../types";
import { DatePluginConfig, DateValue } from "../index";

interface DateEditorProps {
  value: CellValue;
  column: ColumnDef;
  onCellValueChange: (newValue: CellValue) => void;
  onFinishEdit: () => void;
  theme: "light" | "dark";
  readonly?: boolean;
  autoOpen?: boolean;
}

const DateEditor: React.FC<DateEditorProps> = memo(
  ({ value, column, onCellValueChange, onFinishEdit, autoOpen = false }) => {
    const config = column.config as DatePluginConfig | undefined;
    const dateValue = value as DateValue;
    const hasChangedRef = useRef(false);
    const [open, setOpen] = useState(autoOpen);

    const showTime = config?.showTime || false;
    const isRange = config?.isRange || false;
    const format = showTime ? "YYYY-MM-DD HH:mm" : "YYYY-MM-DD";

    const toTimestamp = (str: string | null | undefined) => (str ? dayjs(str).valueOf() : null);

    const handleSingleChange = (next: string | null) => {
      const ts = toTimestamp(next);
      onCellValueChange({ start: ts, end: ts });
      hasChangedRef.current = true;
    };

    const handleRangeChange = (next: [string, string] | null) => {
      if (!next) {
        onCellValueChange({ start: null, end: null });
      } else {
        onCellValueChange({
          start: toTimestamp(next[0]),
          end: toTimestamp(next[1]),
        });
      }
      hasChangedRef.current = true;
    };

    const handleOpenChange = (next: boolean) => {
      setOpen(next);
      if (!next && hasChangedRef.current) {
        onFinishEdit();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        onFinishEdit();
      } else if (e.key === "Escape") {
        if (!hasChangedRef.current) {
          onCellValueChange(value); // 还原为原始值
        }
        onFinishEdit();
      }
    };

    useEffect(() => {
      document.addEventListener("keydown", handleKeyDown);
      return () => {
        document.removeEventListener("keydown", handleKeyDown);
      };
    }, []);

    if (!isRange) {
      const singleValue = dateValue?.start ? dayjs(new Date(dateValue.start)).format(format) : null;

      return (
        <div className="bg-page flex h-full w-full items-center px-1">
          <DatePicker
            value={singleValue}
            onValueChange={handleSingleChange}
            onOpenChange={handleOpenChange}
            open={open}
            precision={showTime ? "minute" : "day"}
            clearable
            size="sm"
            placeholder="选择日期"
            className="w-full"
          />
        </div>
      );
    }

    const rangeValue: [string, string] | null =
      dateValue?.start || dateValue?.end
        ? [
            dateValue.start ? dayjs(new Date(dateValue.start)).format(format) : "",
            dateValue.end ? dayjs(new Date(dateValue.end)).format(format) : "",
          ]
        : null;

    return (
      <div className="bg-page flex h-full w-full items-center px-1">
        <DateRangePicker
          value={rangeValue}
          onValueChange={handleRangeChange}
          onOpenChange={handleOpenChange}
          open={open}
          precision={showTime ? "minute" : "day"}
          clearable
          size="sm"
          placeholder="日期范围"
          className="w-full"
        />
      </div>
    );
  }
);

export default DateEditor;
