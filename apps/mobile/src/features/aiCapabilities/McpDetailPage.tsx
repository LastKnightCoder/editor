// 工具来源详情：总开关、逐个工具开关（只读 / 会修改 / 执行操作）、连接失败的原因与修复入口。

import { mcpTranslator, sourceDisplayName, sourceDisplayDescription, useMcpI18n } from "./mcp.i18n";
import { ChevronRight, CircleAlert, RefreshCw, Settings2 } from "lucide-react";
import type { AiToolSpec } from "@tau/ai/contracts";
import { GroupLabel } from "../../components/GroupLabel";
import { PageHeaderTextButton } from "../../components/PageHeader";
import { toast } from "../../components/toast";
import { useMobilePlugins } from "../../app/plugins/context";
import { useNavigator } from "../../router";
import {
  useCapabilityPreferences,
  useLibraryPreferences,
} from "../../services/aiChat/capabilityPreferences";
import { connectCustomMcp } from "../../services/aiChat/customMcp";
import { GroupCard, GroupNote, GroupRow, SwitchButton } from "../settings/components/ui";
import { useToolSources } from "./data";
import { SourceIcon } from "./McpPage";
import { sourceStatus, useSourceEnabled } from "./sources";
import { Banner, CapabilityPage, StatusText, Tag, TitleLine } from "./ui";

const RISK = {
  read: "muted",
  write: "warn",
  execute: "danger",
} as const;

export function McpDetailPage(props: { sourceId: string }) {
  const context = useMcpI18n();
  const { t } = context;
  const navigator = useNavigator();
  const runtime = useMobilePlugins();
  const { databaseName, service, all } = useToolSources();
  const source = all.find(item => item.id === props.sourceId);
  const preferences = useLibraryPreferences(databaseName);
  const setToolsEnabled = useCapabilityPreferences(state => state.setToolsEnabled);
  const { isEnabled, setEnabled } = useSourceEnabled(databaseName);

  if (!source) {
    return (
      <CapabilityPage title={t("title")}>
        <p className="text-ink-3 text-tau-meta px-8 py-16 text-center">{t("detail.unavailable")}</p>
      </CapabilityPage>
    );
  }
  const enabled = isEnabled(source);
  const status = sourceStatus(source, enabled, context);
  const toolOn = (tool: AiToolSpec) => !preferences.disabledTools.includes(tool.id);
  const enabledCount = source.tools.filter(toolOn).length;
  const settingsId =
    source.pluginId &&
    [...(runtime?.settings.entries() ?? [])].find(
      ([, entry]) => entry.context.pluginId === source.pluginId
    )?.[0];

  const reconnect = async () => {
    if (!service || !source.custom) return;
    try {
      await connectCustomMcp(service, databaseName, source.custom);
      toast.success(mcpTranslator.t("reconnected"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : mcpTranslator.t("error.reconnect"));
    }
  };

  return (
    <CapabilityPage
      actions={
        source.custom ? (
          <PageHeaderTextButton
            onClick={() => navigator.push("aiMcpServer", { serverId: source.custom?.id })}
          >
            {t("edit")}
          </PageHeaderTextButton>
        ) : undefined
      }
    >
      <div className="flex items-center gap-3 px-1 pt-1 pb-1">
        <SourceIcon source={source} large />
        <span className="min-w-0 flex-1">
          <span className="text-ink-1 block truncate text-[19px] font-extrabold">
            {sourceDisplayName(source, context)}
          </span>
          <StatusText tone={status.tone}>
            {t(`kind.${source.kind}`)}
            {status.text}
          </StatusText>
        </span>
        {!source.needsSetup && (
          <SwitchButton checked={enabled} onChange={() => void setEnabled(source, !enabled)} />
        )}
      </div>
      {source.description && (
        <p className="text-ink-2 text-tau-sm px-1 leading-relaxed break-all">
          {sourceDisplayDescription(source, context)}
        </p>
      )}

      {source.needsSetup && (
        <Banner
          tone="info"
          icon={<Settings2 size={16} className="mt-0.5 shrink-0" aria-hidden="true" />}
          title={t("setup.title")}
          action={{
            label: t("setup.action"),
            onClick: () => navigator.push("settingsModule", { module: "image-generation" }),
          }}
        >
          {t("setup.hint")}
        </Banner>
      )}

      {enabled && source.status === "error" && (
        <>
          <Banner
            tone="error"
            icon={<CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />}
            title={t("connection.failed")}
          >
            {source.error ?? t("connection.fallback")}
          </Banner>
          <div className="flex gap-2 px-1 pt-2.5">
            {source.kind === "custom" && (
              <button
                type="button"
                className="bg-surface text-ink-1 shadow-card text-tau-meta flex h-10 flex-1 items-center justify-center gap-2 rounded-xl font-semibold"
                onClick={() => void reconnect()}
              >
                <RefreshCw size={15} aria-hidden="true" />
                {t("reconnect")}
              </button>
            )}
            {settingsId && (
              <button
                type="button"
                className="bg-surface text-ink-1 shadow-card text-tau-meta flex h-10 flex-1 items-center justify-center gap-2 rounded-xl font-semibold"
                onClick={() => navigator.push("pluginSettings", { id: settingsId })}
              >
                <Settings2 size={15} aria-hidden="true" />
                {t("plugin.settings")}
              </button>
            )}
          </div>
        </>
      )}

      {source.tools.length > 0 && (
        <>
          <GroupLabel>
            {t("tools.enabled", { enabled: enabledCount, total: source.tools.length })}
          </GroupLabel>
          <GroupCard>
            {source.tools.map(tool => {
              const risk = RISK[tool.risk];
              return (
                <GroupRow key={tool.id} className="items-start">
                  <span className={`min-w-0 flex-1 ${enabled ? "" : "opacity-50"}`}>
                    <TitleLine
                      mono
                      title={tool.name}
                      tags={<Tag tone={risk}>{t(`risk.${tool.risk}`)}</Tag>}
                    />
                    <span className="text-ink-3 text-tau-sm mt-0.5 line-clamp-2 block">
                      {tool.description}
                    </span>
                  </span>
                  <span className="mt-1 shrink-0">
                    <SwitchButton
                      checked={toolOn(tool)}
                      onChange={() => {
                        setToolsEnabled(databaseName, [tool.id], !toolOn(tool));
                        toast.success(
                          mcpTranslator.t(toolOn(tool) ? "tool.disabled" : "tool.enabled", {
                            name: tool.name,
                          })
                        );
                      }}
                    />
                  </span>
                </GroupRow>
              );
            })}
          </GroupCard>
          <GroupNote>{t("tools.safety")}</GroupNote>
        </>
      )}
      {source.tools.length === 0 && source.status !== "error" && !source.needsSetup && (
        <p className="text-ink-3 text-tau-sm px-1 py-6 text-center">
          {source.status === "connecting" ? t("tools.wait") : t("tools.empty")}
        </p>
      )}

      {source.pluginId && (
        <>
          <GroupLabel>{t("source.title")}</GroupLabel>
          <GroupCard>
            <GroupRow onClick={() => navigator.push("pluginDetail", { pluginId: source.pluginId })}>
              <span className="min-w-0 flex-1">
                <span className="text-ink-1 text-tau-body block font-medium">
                  {source.pluginName}
                </span>
                <span className="text-ink-3 text-tau-sm block">{t("plugin")}</span>
              </span>
              <ChevronRight size={16} className="text-ink-3 shrink-0" aria-hidden="true" />
            </GroupRow>
          </GroupCard>
        </>
      )}
    </CapabilityPage>
  );
}
