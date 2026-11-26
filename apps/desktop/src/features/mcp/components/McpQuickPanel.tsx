import { useMcpListI18n } from "../list.i18n";
/**
 * 输入框 ＋ 面板里的「MCP 服务器」二级面板：只做启停开关，完整管理跳到 MCP 页。
 * 开关与 MCP 页同源（全局生效，不是按会话）。页面专属工具（Vibe Learning、视频笔记、PDF）
 * 只属于对应页面的对话（toolScope），常开，列在「当前页面」组，开关只读。
 */

import { useMemo } from "react";
import { ArrowUpRight } from "lucide-react";
import { Switch, cn } from "@tau/ui";
import { openPage } from "@/services/page-navigation";
import type { ScopedToolSource } from "@/tools/toolRegistry";
import {
  setServerEnabled,
  useMcpServers,
  useScopedToolSource,
  getSubagentServerItem,
  type McpServerItem,
} from "../useMcpServers";
import { StatusDot } from "../views/ServerVisual";
import { statusText } from "../statusText";

function Row({ item }: { item: McpServerItem }) {
  const context = useMcpListI18n();
  const { t } = context;
  return (
    <label
      className={cn(
        "text-tau-body hover:bg-hover flex h-[36px] items-center gap-2.5 rounded-[10px] px-2.5",
        item.locked ? "cursor-default" : "cursor-pointer"
      )}
    >
      <StatusDot status={item.status} />
      <span
        className="min-w-0 flex-1 truncate"
        title={
          item.pluginName
            ? t("source.plugin", { name: item.pluginName })
            : item.locked
              ? item.description
              : undefined
        }
      >
        {item.name}
      </span>
      <span
        className={
          item.status === "error"
            ? "text-tau-sm text-danger shrink-0"
            : "text-tau-sm text-ink-3 shrink-0 tabular-nums"
        }
      >
        {item.enabled ? statusText(item, context) : ""}
      </span>
      <Switch
        size="sm"
        aria-label={
          item.locked
            ? t("toggle.locked", { name: item.name })
            : item.enabled
              ? t("toggle.disable", { name: item.name })
              : t("toggle.enable", { name: item.name })
        }
        checked={item.enabled}
        disabled={item.locked || item.status === "unavailable"}
        onCheckedChange={v => void setServerEnabled(item, v)}
      />
    </label>
  );
}

function ScopedRow({ scene }: { scene: ScopedToolSource }) {
  const { t, locale } = useMcpListI18n();
  return (
    <div
      title={t("quick.scopeHint")}
      className="text-tau-body flex h-[36px] items-center gap-2.5 rounded-[10px] px-2.5"
    >
      <StatusDot status="ready" />
      <span className="min-w-0 flex-1 truncate">{scene.label}</span>
      <span className="text-tau-sm text-ink-3 shrink-0 tabular-nums">
        {t("quick.tools", {
          count: scene.tools.length,
          number: scene.tools.length.toLocaleString(locale),
        })}
      </span>
      <Switch size="sm" aria-label={t("toggle.locked", { name: scene.label })} checked disabled />
    </div>
  );
}

export function McpQuickPanel({ toolScope, onClose }: { toolScope?: string; onClose: () => void }) {
  const { t } = useMcpListI18n();
  const { builtin, custom } = useMcpServers();
  const subagentServer = useMemo(() => getSubagentServerItem(), []);
  const scoped = useScopedToolSource(toolScope);
  const groupTitle = (title: string) => (
    <div className="text-tau-sm text-ink-3 px-2.5 pt-2 pb-1 font-semibold first:pt-1">{title}</div>
  );
  const group = (title: string, items: McpServerItem[]) =>
    items.length > 0 && (
      <>
        {groupTitle(title)}
        {items.map(item => (
          <Row key={item.id} item={item} />
        ))}
      </>
    );

  return (
    <>
      {scoped && (
        <>
          {groupTitle(t("quick.current"))}
          <ScopedRow scene={scoped} />
        </>
      )}
      {group(t("quick.custom"), custom)}
      {group(t("quick.builtin"), [...builtin, subagentServer])}
      <button
        type="button"
        onClick={() => {
          onClose();
          openPage("mcp");
        }}
        className="text-tau-body text-accent-text hover:bg-hover mt-1 flex h-[36px] w-full items-center gap-2 rounded-[10px] px-2.5"
      >
        {t("quick.manage")}
        <ArrowUpRight className="ml-auto size-3.5" strokeWidth={1.75} />
      </button>
    </>
  );
}
