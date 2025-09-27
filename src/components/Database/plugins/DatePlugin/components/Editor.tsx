import React, { useEffect, memo } from "react";
import { useMemoizedFn } from "ahooks";
import { DatePicker } from "antd";
import dayjs from "dayjs";
import "./Editor.less";

import { CellValue, ColumnDef } from "../../../types";

interface DateEditorProps {
  value: CellValue;
  column: ColumnDef;
  onCellValueChange: (newValue: CellValue) => void;
  onFinishEdit: () => void;
  theme: "light" | "dark";
}

const DateEditor: React.FC<DateEditorProps> = memo(
  ({ value, onCellValueChange, onFinishEdit }) => {
    const dateValue = typeof value === "number" ? dayjs(new Date(value)) : null;

    useEffect(() => {
      const pickerInput = document.querySelector(
        `.tw-date-editor .ant-picker-input input`,
      );
      if (pickerInput) {
        (pickerInput as HTMLElement).focus();
      }
    }, []);

    // 处理日期变更
    const handleChange = (date: dayjs.Dayjs | null) => {
      const ts = date ? date.toDate().getTime() : null;
      onCellValueChange(ts);
      onFinishEdit();
    };

    const handleKeyDown = useMemoizedFn((e: KeyboardEvent) => {
      if (e.key === "Enter") {
        onFinishEdit();
      } else if (e.key === "Escape") {
        onCellValueChange(value); // 还原为原始值
        onFinishEdit();
      }
    });

    useEffect(() => {
      document.addEventListener("keydown", handleKeyDown);
      return () => {
        document.removeEventListener("keydown", handleKeyDown);
      };
    }, [handleKeyDown]);

    return (
      <div className={`tw-date-editor w-full h-full`}>
        <DatePicker
          value={dateValue}
          onChange={handleChange}
          allowClear
          format="YYYY-MM-DD"
          inputReadOnly={false}
          autoFocus
          className="w-full h-full border-0 outline-none shadow-none bg-transparent [&_.ant-picker-input]:h-full [&_.ant-picker-input>input]:h-full [&_.ant-picker-input>input]:px-4 [&_.ant-picker-input>input]:py-2"
        />
      </div>
    );
  },
);

export default DateEditor;
