import React, { memo } from "react";
import ColumnDropdown from "../../ColumnDropdown";
import type { CalendarViewConfig } from "../../types";
import type { ViewOptionsPanelProps } from "../types";

/** 日历视图的专属配置区块：日期列（受控，viewOptions.calendar） */
const CalendarOptionsPanel: React.FC<ViewOptionsPanelProps<CalendarViewConfig>> = memo(
  ({ options, onChange, columns, pluginManager }) => {
    const dateColumnId = options?.dateColumnId ?? "";
    const dateColumns = columns.filter(col => pluginManager.hasCapability(col.type, "date"));

    return (
      <>
        <ColumnDropdown
          columns={dateColumns}
          selectedId={dateColumnId}
          onSelect={nextDateColumnId => onChange({ dateColumnId: nextDateColumnId })}
          placeholder={dateColumns.length === 0 ? "无日期列" : "选择日期列（默认使用第一个日期列）"}
          disabled={dateColumns.length === 0}
          allowClear
          label="日期列"
        />
        {dateColumns.length === 0 && (
          <div className="text-tau-sm text-ink-3">请先添加一个日期类型的列</div>
        )}
      </>
    );
  }
);

CalendarOptionsPanel.displayName = "CalendarOptionsPanel";

export default CalendarOptionsPanel;
