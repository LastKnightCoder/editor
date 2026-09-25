/**
 * 输入框 ＋ 面板里的「MCP 服务器」二级面板：只做启停开关，完整管理跳到 MCP 页。
 * 开关与 MCP 页同源（全局生效，不是按会话）。
 */

import { ArrowUpRight } from "lucide-react";
import { Switch } from "@tau/ui";
import { openPage } from "@/services/page-navigation";
import { setServerEnabled, useMcpServers, type McpServerItem } from "../useMcpServers";
import { StatusDot, statusText } from "../views/ServerVisual";

function Row({ item }: { item: McpServerItem }) {
  return (
    <label className="text-tau-body hover:bg-hover flex h-[36px] cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5">
      <StatusDot status={item.status} />
      <span className="min-w-0 flex-1 truncate">{item.name}</span>
      <span
        className={
          item.status === "error"
            ? "text-tau-sm text-danger shrink-0"
            : "text-tau-sm text-ink-3 shrink-0 tabular-nums"
        }
      >
        {item.enabled ? statusText(item) : ""}
      </span>
      <Switch
        size="sm"
        aria-label={item.enabled ? `停用 ${item.name}` : `启用 ${item.name}`}
        checked={item.enabled}
        disabled={item.status === "unavailable"}
        onCheckedChange={v => void setServerEnabled(item, v)}
      />
    </label>
  );
}

export function McpQuickPanel({ onClose }: { onClose: () => void }) {
  const { builtin, custom } = useMcpServers();
  const group = (title: string, items: McpServerItem[]) =>
    items.length > 0 && (
      <>
        <div className="text-tau-sm text-ink-3 px-2.5 pb-1 pt-2 font-semibold first:pt-1">
          {title}
        </div>
        {items.map(item => (
          <Row key={item.id} item={item} />
        ))}
      </>
    );

  return (
    <>
      {group("自定义", custom)}
      {group("内置", builtin)}
      <button
        type="button"
        onClick={() => {
          onClose();
          openPage("mcp");
        }}
        className="text-tau-body text-accent-text hover:bg-hover mt-1 flex h-[36px] w-full items-center gap-2 rounded-[10px] px-2.5"
      >
        管理 MCP 服务器
        <ArrowUpRight className="ml-auto size-3.5" strokeWidth={1.75} />
      </button>
    </>
  );
}
