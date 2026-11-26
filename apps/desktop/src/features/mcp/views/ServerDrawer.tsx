import { useMcpFormsI18n } from "../forms.i18n";
import { configIssueText } from "../serverConfigDisplay";
/**
 * 服务器详情抽屉（通用 Drawer，md 560px）：头部身份 + 启停；自定义服务器分「工具 / 配置 / 日志」，
 * 内置只有工具。工具开关与启停即时生效；配置改动需「保存并重连」。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { CircleAlert, Copy, Info, MoreHorizontal, RefreshCw, Search, Trash2 } from "lucide-react";
import {
  Button,
  Drawer,
  IconButton,
  Input,
  Menu,
  Segmented,
  Switch,
  Tooltip,
  cn,
  toast,
  useRetainedValue,
} from "@tau/ui";
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
  const { t, locale } = useMcpFormsI18n();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const tools = q
    ? item.tools.filter(
        t =>
          (t.displayName ?? t.name).toLowerCase().includes(q) ||
          t.description?.toLowerCase().includes(q)
      )
    : item.tools;
  const enabledCount = item.tools.filter(tool => !item.disabledTools.has(tool.name)).length;
  const locked = item.locked ?? false;

  const banner =
    item.status === "error" ? (
      <Banner
        tone="danger"
        action={
          item.server && (
            <div className="flex shrink-0 gap-1">
              <Button size="sm" variant="ghost" onClick={onShowLogs}>
                {t("tools.logs")}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                icon={RefreshCw}
                onClick={() => void reconnectServer(item.id)}
              >
                {t("action.retry")}
              </Button>
            </div>
          )
        }
      >
        <b className="font-semibold">
          {t(item.server ? "tools.connectFailed" : "tools.loadFailed")}
        </b>
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
              {t("tools.settings")}
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
            ? t("tools.connecting")
            : item.status === "off"
              ? t("tools.off")
              : item.status === "error"
                ? t("tools.wait")
                : t("tools.empty")}
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
          placeholder={t("tools.filter")}
          wrapperClassName="w-[220px]"
        />
        <span className="flex-1" />
        <span className="text-tau-sm text-ink-3 tabular-nums">
          {locked
            ? t("tools.locked", {
                count: item.tools.length,
                number: item.tools.length.toLocaleString(locale),
              })
            : t("tools.enabled", {
                enabled: enabledCount.toLocaleString(locale),
                number: item.tools.length.toLocaleString(locale),
              })}
        </span>
        {!locked && (
          <Menu
            align="end"
            trigger={
              <Button size="sm" variant="ghost">
                {t("tools.batch")}
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
              {t("tools.enableAll")}
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
              {t("tools.disableAll")}
            </Menu.Item>
          </Menu>
        )}
      </div>
      <ul className="-mx-2 flex flex-col">
        {tools.map(tool => {
          const label = tool.displayName ?? tool.name;
          const enabled = locked || !item.disabledTools.has(tool.name);
          const params = Object.keys(tool.parameters?.properties ?? {});
          const required = new Set(tool.parameters?.required ?? []);
          return (
            <li
              key={tool.name}
              className="hover:bg-hover flex items-start gap-3 rounded-[10px] px-2 py-2.5"
            >
              <div className={cn("min-w-0 flex-1", !enabled && "opacity-50")}>
                <div className="font-tau-mono text-ink-1 text-[12.5px] break-all">{label}</div>
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
                aria-label={t(
                  locked ? "toggle.locked" : enabled ? "toggle.disable" : "toggle.enable",
                  { name: label }
                )}
                checked={enabled}
                disabled={locked}
                onCheckedChange={v => setToolsEnabled(item, [tool.name], v)}
                className="mt-0.5"
              />
            </li>
          );
        })}
        {tools.length === 0 && (
          <li className="text-tau-meta text-ink-3 py-8 text-center">{t("tools.noMatch")}</li>
        )}
      </ul>
    </>
  );
}

function ConfigPane({
  server,
  pluginProvided = false,
  displayIdentity,
}: {
  server: CustomMCPServer;
  pluginProvided?: boolean;
  displayIdentity?: Pick<McpServerItem, "name" | "description">;
}) {
  const { t } = useMcpFormsI18n();
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
      toast.success(t(server.enabled ? "config.savedReconnect" : "config.saved"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* 换服务器时表单整体重建（JSON 模式等内部状态不串） */}
      <ServerForm
        key={server.id}
        draft={draft}
        onChange={setDraft}
        identityReadOnly={pluginProvided}
        displayIdentity={displayIdentity}
      />
      <div className="mt-5 flex items-center justify-end gap-2">
        {dirty && invalid && (
          <span className="text-tau-sm text-danger mr-auto">{configIssueText(invalid, t)}</span>
        )}
        <Button variant="ghost" disabled={!dirty} onClick={() => setDraft(initial)}>
          {t("config.undo")}
        </Button>
        <Button
          variant="primary"
          disabled={!dirty || Boolean(invalid)}
          loading={saving}
          onClick={() => void save()}
        >
          {t(server.enabled ? "config.saveReconnect" : "config.save")}
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

const formatTime = (time: number, locale: string) =>
  new Date(time).toLocaleTimeString(locale, { hour12: false });

function LogsPane({ serverId }: { serverId: string }) {
  const { t, locale } = useMcpFormsI18n();
  const { lines, clear } = useMcpLogs(serverId);
  const endRef = useRef<HTMLDivElement>(null);
  // scrollIntoView 在新版 Chromium 返回 Promise，不能直接作为 effect 返回值
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [lines.length]);

  const copy = async () => {
    const text = lines
      .map(
        l => `${formatTime(l.time, "zh-CN")} ${l.level === "stderr" ? "[stderr] " : ""}${l.text}`
      )
      .join("\n");
    await navigator.clipboard.writeText(text);
    toast.success(t("logs.copied"));
  };

  return (
    <>
      <div className="mb-2 flex items-center gap-1">
        <span className="text-tau-sm text-ink-3">{t("logs.hint")}</span>
        <span className="flex-1" />
        <Button
          size="sm"
          variant="ghost"
          icon={Copy}
          disabled={lines.length === 0}
          onClick={() => void copy()}
        >
          {t("action.copy")}{" "}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={Trash2}
          disabled={lines.length === 0}
          onClick={() => void clear()}
        >
          {t("logs.clear")}
        </Button>
      </div>
      {lines.length === 0 ? (
        <p className="text-tau-meta text-ink-3 py-10 text-center">{t("logs.empty")}</p>
      ) : (
        <div className="bg-hover font-tau-mono rounded-[12px] px-3.5 py-3 text-[11.5px] leading-[1.75]">
          {lines.map((line, index) => (
            <div key={index} className="flex gap-2.5">
              <span className="text-ink-3 shrink-0 tabular-nums">
                {formatTime(line.time, locale)}
              </span>
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
  const { t } = useMcpFormsI18n();
  const [tab, setTab] = useState<DrawerTab>("tools");
  const current = useRetainedValue(item);
  const currentId = current?.id;
  useEffect(() => setTab("tools"), [currentId]);
  const custom = current?.kind === "custom";
  const remote = Boolean(current?.server);

  const copyJson = async () => {
    if (!current?.server) return;
    await navigator.clipboard.writeText(serversToJson([current.server]));
    toast.success(t("drawer.copied"));
  };

  return (
    <Drawer
      open={item !== null}
      onOpenChange={open => !open && onClose()}
      label={current ? t("drawer.named", { name: current.name }) : t("drawer.title")}
      icon={current && <ServerIcon item={current} size="lg" />}
      title={
        current && (
          <>
            <span className="truncate">{current.name}</span>
            <span className="text-tau-micro text-ink-3 border-line-1 shrink-0 rounded-[5px] border px-1.5 font-normal">
              {current.pluginName
                ? t("drawer.plugin", { name: current.pluginName })
                : custom
                  ? current.server?.transport.type === "stdio"
                    ? "stdio"
                    : "http"
                  : t("drawer.builtin")}
            </span>
          </>
        )
      }
      subtitle={current?.description && <p className="text-ink-2 m-0">{current.description}</p>}
      meta={
        current && (
          <>
            <StatusLine item={current} className="shrink-0" />
            {current.target && (
              <span className="font-tau-mono text-ink-3 min-w-0 truncate text-[11.5px]">
                {current.target}
              </span>
            )}
          </>
        )
      }
      actions={
        current && (
          <>
            {remote && (
              <>
                <Tooltip content={t("drawer.reconnect")}>
                  <IconButton
                    aria-label={t("drawer.reconnect")}
                    disabled={!current.enabled}
                    onClick={() => void reconnectServer(current.id)}
                  >
                    <RefreshCw className="size-4" strokeWidth={1.75} />
                  </IconButton>
                </Tooltip>
                {custom && (
                  <Menu
                    align="end"
                    trigger={
                      <IconButton aria-label={t("action.more")}>
                        <MoreHorizontal className="size-4" strokeWidth={1.75} />
                      </IconButton>
                    }
                  >
                    <Menu.Item icon={<Copy />} onSelect={() => void copyJson()}>
                      {t("drawer.copy")}
                    </Menu.Item>
                    <Menu.Separator />
                    <Menu.Item icon={<Trash2 />} danger onSelect={() => onDelete(current)}>
                      {t("drawer.delete")}
                    </Menu.Item>
                  </Menu>
                )}
              </>
            )}
            <Switch
              aria-label={
                current.locked
                  ? t("toggle.locked", { name: current.name })
                  : current.enabled
                    ? t("drawer.disable")
                    : t("drawer.enable")
              }
              checked={current.enabled}
              disabled={current.locked || current.status === "unavailable"}
              onCheckedChange={v => void setServerEnabled(current, v)}
              className="mx-1.5"
            />
          </>
        )
      }
      toolbar={
        remote && (
          <Segmented
            label={t("drawer.sections")}
            size="sm"
            value={tab}
            onValueChange={(v: DrawerTab) => setTab(v)}
          >
            <Segmented.Item value="tools" label={t("drawer.tools")} />
            <Segmented.Item value="config" label={t("drawer.config")} />
            <Segmented.Item value="logs" label={t("drawer.logs")} />
          </Segmented>
        )
      }
    >
      {current &&
        (tab === "config" && current.server ? (
          <ConfigPane
            server={current.server}
            pluginProvided={current.kind === "plugin"}
            displayIdentity={current}
          />
        ) : tab === "logs" && remote ? (
          <LogsPane serverId={current.connectionId ?? current.id} />
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
        ))}
    </Drawer>
  );
}
