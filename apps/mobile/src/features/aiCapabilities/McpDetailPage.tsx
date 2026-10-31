// 工具来源详情：总开关、逐个工具开关（只读 / 会修改 / 执行操作）、连接失败的原因与修复入口。

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
  read: { label: "只读", tone: "muted" },
  write: { label: "会修改", tone: "warn" },
  execute: { label: "执行操作", tone: "danger" },
} as const;

export function McpDetailPage(props: { sourceId: string }) {
  const navigator = useNavigator();
  const runtime = useMobilePlugins();
  const { databaseName, service, all } = useToolSources();
  const source = all.find(item => item.id === props.sourceId);
  const preferences = useLibraryPreferences(databaseName);
  const setToolsEnabled = useCapabilityPreferences(state => state.setToolsEnabled);
  const { isEnabled, setEnabled } = useSourceEnabled(databaseName);

  if (!source) {
    return (
      <CapabilityPage title="MCP 服务器">
        <p className="text-ink-3 text-tau-meta px-8 py-16 text-center">
          这个服务器已不可用，可能已删除或来源插件已停用。
        </p>
      </CapabilityPage>
    );
  }
  const enabled = isEnabled(source);
  const status = sourceStatus(source, enabled);
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
      toast.success("已重新连接");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "重新连接失败");
    }
  };

  return (
    <CapabilityPage
      actions={
        source.custom ? (
          <PageHeaderTextButton
            onClick={() => navigator.push("aiMcpServer", { serverId: source.custom?.id })}
          >
            编辑
          </PageHeaderTextButton>
        ) : undefined
      }
    >
      <div className="flex items-center gap-3 px-1 pt-1 pb-1">
        <SourceIcon source={source} large />
        <span className="min-w-0 flex-1">
          <span className="text-ink-1 block truncate text-[19px] font-extrabold">
            {source.name}
          </span>
          <StatusText tone={status.tone}>
            {source.kind === "custom"
              ? "远程 · "
              : source.kind === "plugin"
                ? "插件 · "
                : "Tau 自带 · "}
            {status.text}
          </StatusText>
        </span>
        {!source.needsSetup && (
          <SwitchButton checked={enabled} onChange={() => void setEnabled(source, !enabled)} />
        )}
      </div>
      {source.description && (
        <p className="text-ink-2 text-tau-sm px-1 leading-relaxed break-all">
          {source.description}
        </p>
      )}

      {source.needsSetup && (
        <Banner
          tone="info"
          icon={<Settings2 size={16} className="mt-0.5 shrink-0" aria-hidden="true" />}
          title="需要先选用图片服务"
          action={{
            label: "去设置",
            onClick: () => navigator.push("settingsModule", { module: "image-generation" }),
          }}
        >
          在「我的 › 图片生成」里添加并选用账号后，对话就能生成和编辑图片。
        </Banner>
      )}

      {enabled && source.status === "error" && (
        <>
          <Banner
            tone="error"
            icon={<CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />}
            title="连接失败"
          >
            {source.error ?? "服务器拒绝了连接或网络不可用。"}
          </Banner>
          <div className="flex gap-2 px-1 pt-2.5">
            {source.kind === "custom" && (
              <button
                type="button"
                className="bg-surface text-ink-1 shadow-card text-tau-meta flex h-10 flex-1 items-center justify-center gap-2 rounded-xl font-semibold"
                onClick={() => void reconnect()}
              >
                <RefreshCw size={15} aria-hidden="true" />
                重新连接
              </button>
            )}
            {settingsId && (
              <button
                type="button"
                className="bg-surface text-ink-1 shadow-card text-tau-meta flex h-10 flex-1 items-center justify-center gap-2 rounded-xl font-semibold"
                onClick={() => navigator.push("pluginSettings", { id: settingsId })}
              >
                <Settings2 size={15} aria-hidden="true" />
                打开插件设置
              </button>
            )}
          </div>
        </>
      )}

      {source.tools.length > 0 && (
        <>
          <GroupLabel>
            工具 · 已启用 {enabledCount} / {source.tools.length}
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
                      tags={<Tag tone={risk.tone}>{risk.label}</Tag>}
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
                          `已${toolOn(tool) ? "关闭" : "打开"} ${tool.name}，下一条消息起生效`
                        );
                      }}
                    />
                  </span>
                </GroupRow>
              );
            })}
          </GroupCard>
          <GroupNote>会修改或执行操作的工具，每次运行前都会在对话里请你确认。</GroupNote>
        </>
      )}
      {source.tools.length === 0 && source.status !== "error" && !source.needsSetup && (
        <p className="text-ink-3 text-tau-sm px-1 py-6 text-center">
          {source.status === "connecting" ? "连接成功后显示工具列表" : "暂无工具"}
        </p>
      )}

      {source.pluginId && (
        <>
          <GroupLabel>来源</GroupLabel>
          <GroupCard>
            <GroupRow onClick={() => navigator.push("pluginDetail", { pluginId: source.pluginId })}>
              <span className="min-w-0 flex-1">
                <span className="text-ink-1 text-tau-body block font-medium">
                  {source.pluginName}
                </span>
                <span className="text-ink-3 text-tau-sm block">插件</span>
              </span>
              <ChevronRight size={16} className="text-ink-3 shrink-0" aria-hidden="true" />
            </GroupRow>
          </GroupCard>
        </>
      )}
    </CapabilityPage>
  );
}
