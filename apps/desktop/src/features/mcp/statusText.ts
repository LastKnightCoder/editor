import type { McpServerItem } from "./useMcpServers";
import type { McpListContext } from "./list.messages";

export function statusText(item: McpServerItem, { t, locale }: McpListContext): string {
  const count = item.tools.length;
  const number = count.toLocaleString(locale);
  if (item.locked) return t("status.locked", { count, number });
  switch (item.status) {
    case "ready":
      return item.tools.length > 0
        ? t("status.tools", {
            count,
            number,
            enabled: item.tools
              .filter(tool => !item.disabledTools.has(tool.name))
              .length.toLocaleString(locale),
          })
        : item.kind === "plugin" && !item.server
          ? t("status.ready")
          : t("status.connected");
    case "connecting":
      return t("status.connecting");
    case "error":
      return t("status.error");
    case "off":
      return t("status.off");
    case "unavailable":
      return t("status.unavailable");
  }
}
