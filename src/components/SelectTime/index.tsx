import { memo, useMemo } from "react";
import { DatePicker, Select } from "antd";
import If from "@/components/If";

import { EFilterType } from "@/types/time";

import styles from "./index.module.less";
import classnames from "classnames";
import dayjs from "dayjs";

interface ISelectTimeProps {
  filterType: EFilterType;
  filterValue: string | string[];
  onSelectFilterTypeChange: (type: EFilterType) => void;
  onFilterValueChange: (value: string | string[]) => void;
  className?: string;
}

const { RangePicker } = DatePicker;

const SelectTime = memo((props: ISelectTimeProps) => {
  const {
    filterType,
    filterValue,
    onSelectFilterTypeChange,
    onFilterValueChange,
    className,
  } = props;

  // 将特殊格式的filterValue转换为dayjs可识别的格式
  const dateValue = useMemo(() => {
    if (!filterValue || Array.isArray(filterValue)) return null;

    if (filterType === EFilterType.QUARTER) {
      // 处理季度格式 "2023-Q1" => dayjs对象
      const [year, quarter] = filterValue.split("-");
      const quarterMonth = (parseInt(quarter.slice(1)) - 1) * 3;
      return dayjs(`${year}-${quarterMonth + 1}-01`);
    }

    if (filterType === EFilterType.WEEK) {
      // 处理周格式 "2023-18周" => dayjs对象
      const [year, week] = filterValue.split("-");
      const weekNum = parseInt(week.slice(0, -1));
      return dayjs().year(parseInt(year)).week(weekNum);
    }

    return dayjs(filterValue);
  }, [filterType, filterValue]);

  // 当日期选择器值改变时的处理函数
  const handleDateChange = (date: any, dateString: string) => {
    if (filterType === EFilterType.QUARTER) {
      if (!date) {
        onFilterValueChange("");
        return;
      }
      const year = date.year();
      const quarter = Math.floor(date.month() / 3) + 1;
      onFilterValueChange(`${year}-Q${quarter}`);
    } else if (filterType === EFilterType.WEEK) {
      if (!date) {
        onFilterValueChange("");
        return;
      }
      const year = date.year();
      const week = date.week();
      onFilterValueChange(`${year}-${week}周`);
    } else {
      onFilterValueChange(dateString);
    }
  };

  return (
    <div className={classnames(styles.selectTime, className)}>
      <Select
        className={styles.select}
        value={filterType}
        onChange={onSelectFilterTypeChange}
      >
        <Select.Option value={EFilterType.ALL}>全部</Select.Option>
        <Select.Option value={EFilterType.YEAR}>年</Select.Option>
        <Select.Option value={EFilterType.QUARTER}>季度</Select.Option>
        <Select.Option value={EFilterType.MONTH}>月</Select.Option>
        <Select.Option value={EFilterType.WEEK}>周</Select.Option>
        <Select.Option value={EFilterType.DATE}>日</Select.Option>
        <Select.Option value={EFilterType.RANGE}>范围</Select.Option>
      </Select>
      <If condition={filterType === EFilterType.RANGE}>
        <RangePicker
          // @ts-ignore
          value={(filterValue as string[])?.map?.((date) => dayjs(date)) || []}
          className={styles.picker}
          onChange={(_, dateStrings) => {
            onFilterValueChange(dateStrings);
          }}
        />
      </If>
      <If
        condition={
          filterType !== EFilterType.RANGE && filterType !== EFilterType.ALL
        }
      >
        <DatePicker
          value={dateValue}
          className={styles.picker}
          picker={filterType as any}
          // @ts-ignore
          onChange={handleDateChange}
        />
      </If>
    </div>
  );
});

export default SelectTime;
