/**
 * 侧栏「MCP 服务器」入口的连接失败数：离开 MCP 页也能发现坏掉的服务器；
 * 收起为图标列时退化为角点。
 */

import { useMcpErrorCount } from "../useMcpServers";

export function McpNavBadge({ collapsed }: { collapsed: boolean }) {
  const count = useMcpErrorCount();
  if (!count) return null;
  if (collapsed)
    return <i aria-hidden className="bg-danger absolute right-2.5 top-2 size-1.5 rounded-full" />;
  return (
    <span
      aria-label={`${count} 个 MCP 服务器连接失败`}
      className="bg-danger-soft text-danger ml-auto min-w-[18px] shrink-0 rounded-full px-[5px] text-center text-[11px] font-[600] tabular-nums leading-[18px]"
    >
      {count}
    </span>
  );
}
