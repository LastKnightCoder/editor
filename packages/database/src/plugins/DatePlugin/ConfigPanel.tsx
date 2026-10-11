import React, { useEffect } from "react";
import type { FieldConfigPanelProps } from "../../types";
import type { DatePluginConfig } from "./index";
import { Select, Checkbox } from "@tau/ui";

const labelClass = "text-tau-meta font-medium text-ink-2";

const dateFieldOptions = [
  { label: "开始日期", value: "start" },
  { label: "结束日期", value: "end" },
];

/** 日期字段的配置面板：包含时间 / 结束日期与范围下的排序、分组依据 */
const DateConfigPanel: React.FC<FieldConfigPanelProps<DatePluginConfig>> = ({
  config,
  onChange,
}) => {
  const showTime = config?.showTime ?? false;
  const isRange = config?.isRange ?? false;
  const sortField = config?.sortField ?? "start";
  const groupField = config?.groupField ?? "start";

  // config 缺省（新建列 / 切换类型）时落默认配置，保证保存写入完整四键
  useEffect(() => {
    if (!config)
      onChange({ showTime: false, isRange: false, sortField: "start", groupField: "start" });
  }, [config, onChange]);

  return (
    <div className="flex flex-col gap-3">
      <Checkbox
        checked={showTime}
        onChange={() => onChange({ showTime: !showTime, isRange, sortField, groupField })}
        label={<span className="text-tau-body text-ink-1">包含时间</span>}
      />

      <Checkbox
        checked={isRange}
        onChange={() => onChange({ showTime, isRange: !isRange, sortField, groupField })}
        label={<span className="text-tau-body text-ink-1">结束日期</span>}
      />

      {isRange && (
        <>
          <div className="flex flex-col gap-1.5">
            <span className={labelClass}>排序依据</span>
            <Select
              value={sortField}
              onValueChange={value =>
                onChange({ showTime, isRange, sortField: value as "start" | "end", groupField })
              }
              options={dateFieldOptions}
              className="w-full"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className={labelClass}>分组依据</span>
            <Select
              value={groupField}
              onValueChange={value =>
                onChange({ showTime, isRange, sortField, groupField: value as "start" | "end" })
              }
              options={dateFieldOptions}
              className="w-full"
            />
          </div>
        </>
      )}
    </div>
  );
};

export default DateConfigPanel;
