import { FC } from "react";
import { RecurrenceType } from "@/types";
import dayjs from "dayjs";
import CustomSelect from "./CustomSelect";
import NumberInput from "./NumberInput";
import WeekdaySelector from "./WeekdaySelector";
import DatePickerSimple from "./DatePickerSimple";
import Checkbox from "./Checkbox";

interface RecurrenceConfigProps {
  recurrenceType: RecurrenceType;
  onRecurrenceTypeChange: (type: RecurrenceType) => void;
  interval: number;
  onIntervalChange: (interval: number) => void;
  weekdays: number[];
  onWeekdaysChange: (weekdays: number[]) => void;
  monthDay: number | null;
  onMonthDayChange: (day: number | null) => void;
  excludeHolidays: boolean;
  onExcludeHolidaysChange: (exclude: boolean) => void;
  startDate: dayjs.Dayjs;
  onStartDateChange: (date: dayjs.Dayjs) => void;
  endMode: "never" | "date" | "count";
  onEndModeChange: (mode: "never" | "date" | "count") => void;
  endDate: dayjs.Dayjs | null;
  onEndDateChange: (date: dayjs.Dayjs | null) => void;
  maxOccurrences: number | null;
  onMaxOccurrencesChange: (count: number | null) => void;
}

const RECURRENCE_TYPE_OPTIONS = [
  { value: "daily", label: "每天" },
  { value: "weekdays", label: "工作日（周一至周五）" },
  { value: "weekly", label: "每周" },
  { value: "monthly", label: "每月" },
  { value: "yearly", label: "每年" },
];

const END_MODE_OPTIONS = [
  { value: "never", label: "永不结束" },
  { value: "date", label: "指定结束日期" },
  { value: "count", label: "指定重复次数" },
];

const RecurrenceConfig: FC<RecurrenceConfigProps> = ({
  recurrenceType,
  onRecurrenceTypeChange,
  interval,
  onIntervalChange,
  weekdays,
  onWeekdaysChange,
  monthDay,
  onMonthDayChange,
  excludeHolidays,
  onExcludeHolidaysChange,
  startDate,
  onStartDateChange,
  endMode,
  onEndModeChange,
  endDate,
  onEndDateChange,
  maxOccurrences,
  onMaxOccurrencesChange,
}) => {
  return (
    <div className="space-y-4">
      {/* Recurrence Type */}
      <CustomSelect
        label="重复类型"
        value={recurrenceType}
        onChange={(value) => onRecurrenceTypeChange(value as RecurrenceType)}
        options={RECURRENCE_TYPE_OPTIONS}
        required
      />

      {/* Weekly: Weekday Selector */}
      {recurrenceType === "weekly" && (
        <WeekdaySelector value={weekdays} onChange={onWeekdaysChange} />
      )}

      {/* Monthly: Month Day */}
      {recurrenceType === "monthly" && (
        <NumberInput
          label="每月几号"
          value={monthDay}
          onChange={onMonthDayChange}
          min={1}
          max={31}
          placeholder="例如: 15 表示每月15号"
        />
      )}

      {/* Interval */}
      <NumberInput
        label="间隔"
        value={interval}
        onChange={(value) => {
          if (value !== null) {
            onIntervalChange(value);
          }
        }}
        min={1}
        placeholder="例如: 2 表示每2天/周/月"
      />

      {/* Start Date */}
      <DatePickerSimple
        label="开始日期"
        value={startDate}
        onChange={(value) => {
          if (value) {
            onStartDateChange(value);
          }
        }}
      />

      {/* End Mode */}
      <CustomSelect
        label="结束方式"
        value={endMode}
        onChange={(value) =>
          onEndModeChange(value as "never" | "date" | "count")
        }
        options={END_MODE_OPTIONS}
      />

      {/* End Date (if endMode is "date") */}
      {endMode === "date" && (
        <DatePickerSimple
          label="结束日期"
          value={endDate}
          onChange={onEndDateChange}
          required
        />
      )}

      {/* Max Occurrences (if endMode is "count") */}
      {endMode === "count" && (
        <NumberInput
          label="重复次数"
          value={maxOccurrences}
          onChange={onMaxOccurrencesChange}
          min={1}
          placeholder="例如: 10 表示重复10次后结束"
          required
        />
      )}

      {/* Exclude Holidays */}
      <Checkbox
        checked={excludeHolidays}
        onChange={onExcludeHolidaysChange}
        label="排除节假日"
      />
    </div>
  );
};

export default RecurrenceConfig;
