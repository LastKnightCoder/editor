import { memo } from "react";
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
          value={dayjs(filterValue as string)}
          className={styles.picker}
          picker={filterType as any}
          onChange={(_, dateString) => {
            onFilterValueChange(dateString);
          }}
        />
      </If>
    </div>
  );
});

export default SelectTime;
