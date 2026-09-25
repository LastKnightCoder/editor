/**
 * 服务器详情抽屉（右侧滑入 560px）：头部身份 + 启停；自定义服务器分「工具 / 配置 / 日志」，
 * 内置只有工具。工具开关与启停即时生效；配置改动需「保存并重连」。
 * 常驻挂载靠 transform 过渡，关闭态 inert；Esc 走页面浮层仲裁。结构同发布页站点设置抽屉。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CircleAlert,
  Copy,
  Info,
  MoreHorizontal,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  Button,
  IconButton,
  Input,
  Menu,
  PortalScope,
  Segmented,
  Switch,
  Tooltip,
  cn,
  toast,
  usePortalContainer,
} from "@tau/ui";
import { useOverlayDismiss } from "@/page/PageProvider";
import { useSettingsStore } from "@/app/settingsStore";
import type { McpLogEntry } from "@/commands/mcp";
import type { CustomMCPServer } from "@/stores/useMCPStore";
import {
  draftFromServer,
  draftToPayload,
  serversToJson,
  validateDraft,
  type ServerDraft,
} from "../serverConfig";
import {
  reconnectServer,
  saveServer,
  setServerEnabled,
  setToolsEnabled,
  useMcpLogs,
  type McpServerItem,
} from "../useMcpServers";
import { ServerForm } from "./ServerForm";
import { ServerIcon, StatusLine } from "./ServerVisual";

type DrawerTab = "tools" | "config" | "logs";

function Banner({
  tone,
  children,
  action,
}: {
  tone: "danger" | "info";
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  const Icon = tone === "danger" ? CircleAlert : Info;
  return (
    <div
      className={cn(
        "text-tau-meta mb-3.5 flex items-start gap-2.5 rounded-[12px] px-3 py-2.5",
        tone === "danger" ? "bg-danger-soft text-danger" : "bg-info-soft text-info"
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
      <div className="min-w-0 flex-1 break-words">{children}</div>
      {action}
    </div>
  );
}

function ToolsPane({
  item,
  onShowLogs,
  onOpenSettings,
}: {
  item: McpServerItem;
  onShowLogs: () => void;
  onOpenSettings: () => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const tools = q
    ? item.tools.filter(
        t => t.name.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q)
      )
    : item.tools;
  const enabledCount = item.tools.length - item.disabledTools.size;

  const banner =
    item.status === "error" ? (
      <Banner
        tone="danger"
        action={
          <div className="flex shrink-0 gap-1">
            <Button size="sm" variant="ghost" onClick={onShowLogs}>
              查看日志
            </Button>
            <Button
              size="sm"
              variant="secondary"
              icon={RefreshCw}
              onClick={() => void reconnectServer(item.id)}
            >
              重试
            </Button>
          </div>
        }
      >
        <b className="font-semibold">连接失败</b>
        {item.error && (
          <div className="text-ink-1 font-tau-mono mt-0.5 text-[12px]">{item.error}</div>
        )}
      </Banner>
    ) : item.status === "unavailable" ? (
      <Banner
        tone="info"
        action={
          item.settingsSection && (
            <Button size="sm" variant="secondary" onClick={onOpenSettings}>
              前往设置
            </Button>
          )
        }
      >
        {item.error}
      </Banner>
    ) : null;

  if (item.tools.length === 0) {
    return (
      <>
        {banner}
        <p className="text-tau-meta text-ink-3 px-1 py-10 text-center">
          {item.status === "connecting"
            ? "正在连接，连接成功后会列出服务器提供的工具"
            : item.status === "off"
              ? "启用后连接服务器，这里会列出它提供的工具"
              : item.status === "error"
                ? "连接成功后会在这里列出服务器提供的工具"
                : "服务器没有提供工具"}
        </p>
      </>
    );
  }

  return (
    <>
      {banner}
      <div className="mb-2 flex items-center gap-2">
        <Input
          size="sm"
          lead={Search}
          clearable
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="筛选工具"
          wrapperClassName="w-[220px]"
        />
        <span className="flex-1" />
        <span className="text-tau-sm text-ink-3 tabular-nums">
          {enabledCount} / {item.tools.length} 已启用
        </span>
        <Menu
          align="end"
          trigger={
            <Button size="sm" variant="ghost">
              批量
            </Button>
          }
        >
          <Menu.Item
            onSelect={() =>
              setToolsEnabled(
                item,
                item.tools.map(t => t.name),
                true
              )
            }
          >
            全部启用
          </Menu.Item>
          <Menu.Item
            onSelect={() =>
              setToolsEnabled(
                item,
                item.tools.map(t => t.name),
                false
              )
            }
          >
            全部停用
          </Menu.Item>
        </Menu>
      </div>
      <ul className="-mx-2 flex flex-col">
        {tools.map(tool => {
          const enabled = !item.disabledTools.has(tool.name);
          const params = Object.keys(tool.parameters?.properties ?? {});
          const required = new Set(tool.parameters?.required ?? []);
          return (
            <li
              key={tool.name}
              className="hover:bg-hover flex items-start gap-3 rounded-[10px] px-2 py-2.5"
            >
              <div className={cn("min-w-0 flex-1", !enabled && "opacity-50")}>
                <div className="font-tau-mono text-ink-1 break-all text-[12.5px]">{tool.name}</div>
                {tool.description && (
                  <p className="text-tau-sm text-ink-3 mt-0.5 line-clamp-2">{tool.description}</p>
                )}
                {params.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {params.map(p => (
                      <span
                        key={p}
                        className="bg-hover font-tau-mono text-ink-2 rounded-[5px] px-[5px] text-[10.5px] leading-[17px]"
                      >
                        {p}
                        {required.has(p) && <span className="text-danger">*</span>}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <Switch
                size="sm"
                aria-label={`${enabled ? "停用" : "启用"} ${tool.name}`}
                checked={enabled}
                onCheckedChange={v => setToolsEnabled(item, [tool.name], v)}
                className="mt-0.5"
              />
            </li>
          );
        })}
        {tools.length === 0 && (
          <li className="text-tau-meta text-ink-3 py-8 text-center">没有匹配的工具</li>
        )}
      </ul>
    </>
  );
}

function ConfigPane({ server }: { server: CustomMCPServer }) {
  const initial = useMemo(() => draftFromServer(server), [server]);
  const [draft, setDraft] = useState<ServerDraft>(initial);
  const [saving, setSaving] = useState(false);
  // 外部改动（如导入覆盖）后以新配置为准
  useEffect(() => setDraft(initial), [initial]);

  const dirty = JSON.stringify(draftToPayload(draft)) !== JSON.stringify(draftToPayload(initial));
  const invalid = validateDraft(draft);

  const save = async () => {
    setSaving(true);
    try {
      await saveServer(draft, server.id);
      toast.success(server.enabled ? "已保存，正在重新连接" : "已保存");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* 换服务器时表单整体重建（JSON 模式等内部状态不串） */}
      <ServerForm key={server.id} draft={draft} onChange={setDraft} />
      <div className="mt-5 flex items-center justify-end gap-2">
        {dirty && invalid && <span className="text-tau-sm text-danger mr-auto">{invalid}</span>}
        <Button variant="ghost" disabled={!dirty} onClick={() => setDraft(initial)}>
          撤销
        </Button>
        <Button
          variant="primary"
          disabled={!dirty || Boolean(invalid)}
          loading={saving}
          onClick={() => void save()}
        >
          {server.enabled ? "保存并重连" : "保存"}
        </Button>
      </div>
    </>
  );
}

const LOG_TONE: Record<McpLogEntry["level"], string> = {
  info: "text-ink-2",
  ok: "text-ok",
  warn: "text-warn",
  error: "text-danger",
  stderr: "text-ink-2",
};

const formatTime = (time: number) => new Date(time).toLocaleTimeString("zh-CN", { hour12: false });

function LogsPane({ serverId }: { serverId: string }) {
  const { lines, clear } = useMcpLogs(serverId);
  const endRef = useRef<HTMLDivElement>(null);
  // scrollIntoView 在新版 Chromium 返回 Promise，不能直接作为 effect 返回值
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [lines.length]);

  const copy = async () => {
    const text = lines
      .map(l => `${formatTime(l.time)} ${l.level === "stderr" ? "[stderr] " : ""}${l.text}`)
      .join("\n");
    await navigator.clipboard.writeText(text);
    toast.success("已复制日志");
  };

  return (
    <>
      <div className="mb-2 flex items-center gap-1">
        <span className="text-tau-sm text-ink-3">最近 200 行 · 仅本次运行</span>
        <span className="flex-1" />
        <Button
          size="sm"
          variant="ghost"
          icon={Copy}
          disabled={lines.length === 0}
          onClick={() => void copy()}
        >
          复制
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={Trash2}
          disabled={lines.length === 0}
          onClick={() => void clear()}
        >
          清空
        </Button>
      </div>
      {lines.length === 0 ? (
        <p className="text-tau-meta text-ink-3 py-10 text-center">暂无日志</p>
      ) : (
        <div className="bg-hover font-tau-mono rounded-[12px] px-3.5 py-3 text-[11.5px] leading-[1.75]">
          {lines.map((line, index) => (
            <div key={index} className="flex gap-2.5">
              <span className="text-ink-3 shrink-0 tabular-nums">{formatTime(line.time)}</span>
              <span className={cn("min-w-0 whitespace-pre-wrap break-all", LOG_TONE[line.level])}>
                {line.level === "stderr" && <span className="text-ink-3">[stderr] </span>}
                {line.text}
              </span>
            </div>
          ))}
          <div ref={endRef} />
        </div>
      )}
    </>
  );
}

export function ServerDrawer({
  item,
  onClose,
  onDelete,
}: {
  item: McpServerItem | null;
  onClose: () => void;
  onDelete: (item: McpServerItem) => void;
}) {
  const container = usePortalContainer();
  const open = item !== null;
  useOverlayDismiss(onClose, open);
  // 关闭过渡期间保留最后一项，避免内容先消失
  const [shown, setShown] = useState<McpServerItem | null>(item);
  const [tab, setTab] = useState<DrawerTab>("tools");
  useEffect(() => {
    if (item) setShown(item);
  }, [item]);
  const shownId = shown?.id;
  useEffect(() => setTab("tools"), [shownId]);

  const current = shown;
  const custom = current?.kind === "custom";

  const copyJson = async () => {
    if (!current?.server) return;
    await navigator.clipboard.writeText(serversToJson([current.server]));
    toast.success("已复制为 mcpServers JSON");
  };

  return createPortal(
    <PortalScope>
      <div
        aria-hidden
        onClick={onClose}
        className={cn(
          "bg-overlay fixed inset-0 z-[340] transition-opacity duration-200",
          open ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={current ? `${current.name} 详情` : "服务器详情"}
        inert={!open}
        className={cn(
          "bg-surface shadow-float fixed bottom-2 right-2 top-2 z-[340] flex w-[560px] flex-col rounded-[14px]",
          "transition-transform duration-[280ms] ease-[cubic-bezier(.2,.8,.2,1)]",
          open ? "translate-x-0" : "translate-x-[calc(100%+16px)]"
        )}
      >
        {current && (
          <>
            <header className="flex items-start gap-3.5 px-[22px] pt-5">
              <ServerIcon item={current} size="lg" />
              <div className="min-w-0 flex-1">
                <h3 className="flex items-center gap-2 text-[16px] font-semibold">
                  <span className="truncate">{current.name}</span>
                  <span className="text-tau-micro text-ink-3 border-line-1 shrink-0 rounded-[5px] border px-1.5 font-normal">
                    {custom
                      ? current.server?.transport.type === "stdio"
                        ? "stdio"
                        : "http"
                      : "内置"}
                  </span>
                </h3>
                {current.description && (
                  <p className="text-tau-meta text-ink-2 mt-0.5">{current.description}</p>
                )}
                <div className="mt-1.5 flex min-w-0 items-center gap-2.5">
                  <StatusLine item={current} className="shrink-0" />
                  {current.target && (
                    <span className="font-tau-mono text-ink-3 min-w-0 truncate text-[11.5px]">
                      {current.target}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {custom && (
                  <>
                    <Tooltip content="重新连接">
                      <IconButton
                        aria-label="重新连接"
                        disabled={!current.enabled}
                        onClick={() => void reconnectServer(current.id)}
                      >
                        <RefreshCw className="size-4" strokeWidth={1.75} />
                      </IconButton>
                    </Tooltip>
                    <Menu
                      align="end"
                      trigger={
                        <IconButton aria-label="更多">
                          <MoreHorizontal className="size-4" strokeWidth={1.75} />
                        </IconButton>
                      }
                    >
                      <Menu.Item icon={<Copy />} onSelect={() => void copyJson()}>
                        复制为 JSON
                      </Menu.Item>
                      <Menu.Separator />
                      <Menu.Item icon={<Trash2 />} danger onSelect={() => onDelete(current)}>
                        删除服务器
                      </Menu.Item>
                    </Menu>
                  </>
                )}
                <Switch
                  aria-label={current.enabled ? "停用服务器" : "启用服务器"}
                  checked={current.enabled}
                  disabled={current.status === "unavailable"}
                  onCheckedChange={v => void setServerEnabled(current, v)}
                  className="mx-1.5"
                />
                <IconButton aria-label="关闭" onClick={onClose}>
                  <X className="size-4" strokeWidth={1.75} />
                </IconButton>
              </div>
            </header>

            {custom && (
              <div className="px-[22px] pt-4">
                <Segmented
                  label="详情分区"
                  size="sm"
                  value={tab}
                  onValueChange={(v: DrawerTab) => setTab(v)}
                >
                  <Segmented.Item value="tools" label="工具" />
                  <Segmented.Item value="config" label="配置" />
                  <Segmented.Item value="logs" label="日志" />
                </Segmented>
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto px-[22px] pb-6 pt-4">
              {tab === "config" && current.server ? (
                <ConfigPane server={current.server} />
              ) : tab === "logs" && custom ? (
                <LogsPane serverId={current.id} />
              ) : (
                <ToolsPane
                  item={current}
                  onShowLogs={() => setTab("logs")}
                  onOpenSettings={() => {
                    // 设置弹窗与抽屉同层，先关抽屉再打开，避免被盖住（同发布页）
                    onClose();
                    useSettingsStore.getState().openSettings(current.settingsSection);
                  }}
                />
              )}
            </div>
          </>
        )}
      </aside>
    </PortalScope>,
    container
  );
}
