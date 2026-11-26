import { useMcpListI18n } from "../list.i18n";
/**
 * 侧栏「MCP 服务器」入口的连接失败数：离开 MCP 页也能发现坏掉的服务器；
 * 收起为图标列时退化为角点。
 */

import { useMcpErrorCount } from "../useMcpServers";

export function McpNavBadge({ collapsed }: { collapsed: boolean }) {
  const { t, locale } = useMcpListI18n();
  const count = useMcpErrorCount();
  if (!count) return null;
  if (collapsed)
    return <i aria-hidden className="bg-danger absolute top-2 right-2.5 size-1.5 rounded-full" />;
  return (
    <span
      aria-label={t("nav.error", { count, number: count.toLocaleString(locale) })}
      className="bg-danger-soft text-danger ml-auto min-w-[18px] shrink-0 rounded-full px-[5px] text-center text-[11px] leading-[18px] font-[600] tabular-nums"
    >
      {count.toLocaleString(locale)}
    </span>
  );
}
