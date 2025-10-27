import React, { useEffect, memo, useRef } from "react";
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
    const hasChangedRef = useRef(false);
    const isOpenRef = useRef(false);

    useEffect(() => {
      const pickerInput = document.querySelector(
        `.tw-date-editor .ant-picker-input input`,
      );
      if (pickerInput) {
        (pickerInput as HTMLElement).focus();
      }
    }, []);

    // 处理日期变更
    const handleChange = useMemoizedFn((date: dayjs.Dayjs | null) => {
      const ts = date ? date.toDate().getTime() : null;
      onCellValueChange(ts);
      hasChangedRef.current = true;
    });

    // 处理日期选择器打开/关闭状态
    const handleOpenChange = useMemoizedFn((open: boolean) => {
      isOpenRef.current = open;
      // 当日期选择器关闭且有修改时，延迟完成编辑
      if (!open && hasChangedRef.current) {
        setTimeout(() => {
          onFinishEdit();
        }, 100);
      }
    });

    // 处理失焦，完成编辑
    const handleBlur = useMemoizedFn(() => {
      // 如果日期选择器已关闭，则完成编辑
      if (!isOpenRef.current) {
        setTimeout(() => {
          onFinishEdit();
        }, 100);
      }
    });

    const handleKeyDown = useMemoizedFn((e: KeyboardEvent) => {
      if (e.key === "Enter") {
        onFinishEdit();
      } else if (e.key === "Escape") {
        if (!hasChangedRef.current) {
          onCellValueChange(value); // 还原为原始值
        }
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
          onOpenChange={handleOpenChange}
          onBlur={handleBlur}
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
