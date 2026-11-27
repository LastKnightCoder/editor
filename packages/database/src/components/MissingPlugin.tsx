import type { CellPlugin } from "../types";
import { useDatabaseI18n } from "../i18n";

const MissingPluginRenderer: CellPlugin<unknown>["Renderer"] = ({ column }) => {
  const { t } = useDatabaseI18n();
  return (
    <span className="text-ink-3 text-tau-meta px-2">{t("plugin.unsupported", { type: column.type })}</span>
  );
};

export const missingPlugin: CellPlugin<unknown> = {
  type: "unsupported",
  name: "未提供字段插件",
  editable: false,
  Renderer: MissingPluginRenderer,
};
