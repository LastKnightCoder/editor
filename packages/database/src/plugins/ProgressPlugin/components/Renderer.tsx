import React, { memo } from "react";
import { ProgressBar } from "@tau/ui";
import { ColumnDef } from "../../../types";
import { ProgressValue } from "../types";
import { useDatabaseI18n } from "../../../i18n";

interface ProgressRendererProps {
  value: ProgressValue;
  column: ColumnDef;
  theme: "light" | "dark";
  readonly: boolean;
  onCellValueChange: (newValue: ProgressValue) => void;
}

const ProgressRenderer: React.FC<ProgressRendererProps> = memo(({ value }) => {
  const { t } = useDatabaseI18n();
  const progressValue =
    value && typeof value === "object" && "current" in value && "target" in value
      ? (value as ProgressValue)
      : { current: 0, target: 100 };

  return (
    <div className="flex h-full w-full items-center gap-2 px-2 py-1">
      <ProgressBar value={progressValue.current} max={progressValue.target} label={t("plugin.progress.label")} />

      <div className="font-tau-mono text-ink-2 text-tau-sm tabular-nums">
        {progressValue.current}/{progressValue.target}
      </div>
    </div>
  );
});

ProgressRenderer.displayName = "ProgressRenderer";

export default ProgressRenderer;
