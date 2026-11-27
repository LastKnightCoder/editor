import React, { memo } from "react";
import ColumnDropdown from "../../ColumnDropdown";
import type { CalendarViewConfig } from "../../types";
import type { ViewOptionsPanelProps } from "../types";
import { useDatabaseI18n } from "../../i18n";

/** 日历视图的专属配置区块：日期列（受控，viewOptions.calendar） */
const CalendarOptionsPanel: React.FC<ViewOptionsPanelProps<CalendarViewConfig>> = memo(
  ({ options, onChange, columns, pluginManager }) => {
    const { t } = useDatabaseI18n();
    const dateColumnId = options?.dateColumnId ?? "";
    const dateColumns = columns.filter(col => pluginManager.hasCapability(col.type, "date"));

    return (
      <>
        <ColumnDropdown
          columns={dateColumns}
          selectedId={dateColumnId}
          onSelect={nextDateColumnId => onChange({ dateColumnId: nextDateColumnId })}
          placeholder={
            dateColumns.length === 0
              ? t("calendar.dateColumnEmpty")
              : t("calendar.dateColumnPlaceholder")
          }
          disabled={dateColumns.length === 0}
          allowClear
          label={t("view.required.calendar.columnLabel")}
        />
        {dateColumns.length === 0 && (
          <div className="text-tau-sm text-ink-3">{t("calendar.dateColumnHint")}</div>
        )}
      </>
    );
  }
);

CalendarOptionsPanel.displayName = "CalendarOptionsPanel";

export default CalendarOptionsPanel;
