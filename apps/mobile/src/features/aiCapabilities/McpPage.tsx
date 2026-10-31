// MCP 管理：我添加的远程服务器 / Tau 自带工具组 / 插件提供的服务器，行尾整组开关；
// 有连接失败时顶部提示。stdio 不受支持，插件声明时显示为失败并说明原因。

import {
  BookOpen,
  ChevronRight,
  CircleAlert,
  Image as ImageIcon,
  ListChecks,
  Plus,
  Puzzle,
  Server,
  Store,
} from "lucide-react";
import { GroupLabel } from "../../components/GroupLabel";
import { PageHeaderButton } from "../../components/PageHeader";
import { useNavigator } from "../../router";
import { GroupCard, GroupNote, GroupRow, SwitchButton } from "../settings/components/ui";
import { useToolSources, type ToolSource } from "./data";
import { sourceStatus, useSourceEnabled } from "./sources";
import { Banner, CapabilityPage, StatusText, Tile } from "./ui";

export function SourceIcon(props: { source: ToolSource; large?: boolean }) {
  const size = props.large ? 22 : 16;
  if (props.source.kind === "custom")
    return (
      <Tile tone="rose" large={props.large}>
        <Server size={size} aria-hidden="true" />
      </Tile>
    );
  if (props.source.kind === "plugin")
    return (
      <Tile tone="lilac" large={props.large}>
        <Puzzle size={size} aria-hidden="true" />
      </Tile>
    );
  const Icon =
    props.source.id === "host:tasks"
      ? ListChecks
      : props.source.id === "host:images"
        ? ImageIcon
        : BookOpen;
  return (
    <Tile tone="accent" large={props.large}>
      <Icon size={size} aria-hidden="true" />
    </Tile>
  );
}

export function McpPage() {
  const navigator = useNavigator();
  const { databaseName, host, plugin, custom, all } = useToolSources();
  const { isEnabled, setEnabled } = useSourceEnabled(databaseName);
  const failed = all.filter(source => isEnabled(source) && source.status === "error");
  const open = (source: ToolSource) => navigator.push("aiMcpDetail", { sourceId: source.id });

  const row = (source: ToolSource) => {
    const enabled = isEnabled(source);
    const status = sourceStatus(source, enabled);
    return (
      <GroupRow key={source.id} onClick={() => open(source)}>
        <span className={enabled ? undefined : "opacity-50"}>
          <SourceIcon source={source} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-ink-1 text-tau-body block truncate font-medium">{source.name}</span>
          <StatusText tone={status.tone}>{status.text}</StatusText>
        </span>
        {source.needsSetup ? (
          <ChevronRight size={16} className="text-ink-3 shrink-0" aria-hidden="true" />
        ) : (
          <span className="shrink-0" onClick={event => event.stopPropagation()}>
            <SwitchButton checked={enabled} onChange={() => void setEnabled(source, !enabled)} />
          </span>
        )}
      </GroupRow>
    );
  };

  return (
    <CapabilityPage
      title="MCP 服务器"
      actions={
        <PageHeaderButton
          aria-label="添加远程 MCP"
          icon={<Plus />}
          onClick={() => navigator.push("aiMcpServer", {})}
        />
      }
    >
      {failed.length > 0 && (
        <Banner
          tone="error"
          icon={<CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />}
          title={`${failed.length} 个服务器连接失败`}
          action={{ label: "查看", onClick: () => open(failed[0]) }}
        >
          对话里暂时用不了它的工具
        </Banner>
      )}
      {custom.length > 0 && (
        <>
          <GroupLabel>我添加的</GroupLabel>
          <GroupCard>{custom.map(row)}</GroupCard>
        </>
      )}
      <GroupLabel>
        Tau 自带<span className="text-ink-3 ml-2">随应用提供</span>
      </GroupLabel>
      <GroupCard>{host.map(row)}</GroupCard>
      <GroupLabel>
        插件提供<span className="text-ink-3 ml-2">随插件启停</span>
      </GroupLabel>
      <GroupCard>
        {plugin.map(row)}
        <GroupRow onClick={() => navigator.push("plugins", { tab: "store" })}>
          <Tile tone="muted">
            <Store size={16} aria-hidden="true" />
          </Tile>
          <span className="text-accent-text text-tau-body min-w-0 flex-1">找更多工具</span>
          <ChevronRight size={16} className="text-ink-3 shrink-0" aria-hidden="true" />
        </GroupRow>
      </GroupCard>
      <GroupNote>
        会修改数据或执行操作的工具，每次运行前都会在对话里请你确认。插件停用后，它的服务器会从这里消失。
      </GroupNote>
      {!custom.length && (
        <GroupNote className="pt-1">
          手机端可以添加远程 Streamable HTTP 服务器，不能启动本地命令。
        </GroupNote>
      )}
    </CapabilityPage>
  );
}
