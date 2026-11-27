import React, { useEffect } from "react";
import type { FieldConfigPanelProps } from "../../types";
import type { DatePluginConfig } from "./index";
import { Select, Checkbox } from "@tau/ui";
import { useDatabaseI18n, type DatabaseT } from "../../i18n";

const labelClass = "text-tau-meta font-medium text-ink-2";

const dateFieldOptions = (t: DatabaseT) => [
  { label: t("plugin.date.field.start"), value: "start" },
  { label: t("plugin.date.field.end"), value: "end" },
];

/** 日期字段的配置面板：包含时间 / 结束日期与范围下的排序、分组依据 */
const DateConfigPanel: React.FC<FieldConfigPanelProps<DatePluginConfig>> = ({
  config,
  onChange,
}) => {
  const { t } = useDatabaseI18n();
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
        label={<span className="text-tau-body text-ink-1">{t("plugin.date.includeTime")}</span>}
      />

      <Checkbox
        checked={isRange}
        onChange={() => onChange({ showTime, isRange: !isRange, sortField, groupField })}
        label={<span className="text-tau-body text-ink-1">{t("plugin.date.endDate")}</span>}
      />

      {isRange && (
        <>
          <div className="flex flex-col gap-1.5">
            <span className={labelClass}>{t("plugin.date.sortBy")}</span>
            <Select
              value={sortField}
              onValueChange={value =>
                onChange({ showTime, isRange, sortField: value as "start" | "end", groupField })
              }
              options={dateFieldOptions(t)}
              className="w-full"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className={labelClass}>{t("plugin.date.groupBy")}</span>
            <Select
              value={groupField}
              onValueChange={value =>
                onChange({ showTime, isRange, sortField, groupField: value as "start" | "end" })
              }
              options={dateFieldOptions(t)}
              className="w-full"
            />
          </div>
        </>
      )}
    </div>
  );
};

export default DateConfigPanel;
