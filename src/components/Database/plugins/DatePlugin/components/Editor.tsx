import React, { useEffect, memo, useRef } from "react";
import { useMemoizedFn } from "ahooks";
import { DatePicker } from "antd";
import dayjs from "dayjs";
import "./Editor.less";

import { CellValue, ColumnDef } from "../../../types";
import { DatePluginConfig, DateValue } from "../index";

const { RangePicker } = DatePicker;

interface DateEditorProps {
  value: CellValue;
  column: ColumnDef;
  onCellValueChange: (newValue: CellValue) => void;
  onFinishEdit: () => void;
  theme: "light" | "dark";
}

const DateEditor: React.FC<DateEditorProps> = memo(
  ({ value, column, onCellValueChange, onFinishEdit }) => {
    const config = column.config as DatePluginConfig | undefined;
    const dateValue = value as DateValue;
    const hasChangedRef = useRef(false);
    const isOpenRef = useRef(false);

    const showTime = config?.showTime || false;
    const isRange = config?.isRange || false;
    const format = showTime ? "YYYY-MM-DD HH:mm:ss" : "YYYY-MM-DD";

    useEffect(() => {
      const pickerInput = document.querySelector(
        `.tw-date-editor .ant-picker-input input`,
      );
      if (pickerInput) {
        (pickerInput as HTMLElement).focus();
      }
    }, []);

    const handleSingleChange = useMemoizedFn((date: dayjs.Dayjs | null) => {
      const ts = date ? date.toDate().getTime() : null;
      onCellValueChange({ start: ts, end: ts });
      hasChangedRef.current = true;
    });

    const handleRangeChange = useMemoizedFn(
      (dates: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null) => {
        if (!dates) {
          onCellValueChange({ start: null, end: null });
        } else {
          const [start, end] = dates;
          onCellValueChange({
            start: start ? start.toDate().getTime() : null,
            end: end ? end.toDate().getTime() : null,
          });
        }
        hasChangedRef.current = true;
      },
    );

    const handleOpenChange = useMemoizedFn((open: boolean) => {
      isOpenRef.current = open;
      if (!open && hasChangedRef.current) {
        setTimeout(() => {
          onFinishEdit();
        }, 100);
      }
    });

    const handleBlur = useMemoizedFn(() => {
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

    if (!isRange) {
      const singleValue = dateValue?.start
        ? dayjs(new Date(dateValue.start))
        : null;

      return (
        <div className={`tw-date-editor w-full h-full`}>
          <DatePicker
            value={singleValue}
            onChange={handleSingleChange}
            onOpenChange={handleOpenChange}
            onBlur={handleBlur}
            allowClear
            format={format}
            showTime={showTime}
            inputReadOnly={false}
            autoFocus
            className="w-full h-full border-0 outline-none shadow-none bg-transparent [&_.ant-picker-input]:h-full [&_.ant-picker-input>input]:h-full [&_.ant-picker-input>input]:px-4 [&_.ant-picker-input>input]:py-2"
          />
        </div>
      );
    }

    const rangeValue: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null =
      dateValue?.start || dateValue?.end
        ? [
            dateValue.start ? dayjs(new Date(dateValue.start)) : null,
            dateValue.end ? dayjs(new Date(dateValue.end)) : null,
          ]
        : null;

    return (
      <div className={`tw-date-editor w-full h-full`}>
        <RangePicker
          value={rangeValue}
          onChange={handleRangeChange}
          onOpenChange={handleOpenChange}
          onBlur={handleBlur}
          allowClear
          format={format}
          showTime={showTime}
          inputReadOnly={false}
          autoFocus
          className="w-full h-full border-0 outline-none shadow-none bg-transparent [&_.ant-picker-input]:h-full [&_.ant-picker-input>input]:h-full [&_.ant-picker-input>input]:px-4 [&_.ant-picker-input>input]:py-2"
        />
      </div>
    );
  },
);

export default DateEditor;
