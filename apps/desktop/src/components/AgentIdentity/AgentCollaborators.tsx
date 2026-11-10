/**
 * 正文标题栏里的 Agent 协作者：头像组（转圈 = 正在干活，橙点 = 等你处理）+ 一句人话说它在做什么；
 * 点开是「这篇的协作者」，按 Agent 设只读 / 建议 / 直接改，与给真人协作者的权限同一心智。
 * 在场来自主进程在场中枢，权限与参与记录来自本机协作缓存，文章关着时 Agent 也照常更新。
 */

import { useMemo, useState } from "react";
import { Users } from "lucide-react";
import { Popover, Segmented, cn, toast } from "@tau/ui";
import { bindDatabaseCommands } from "@/services/command-context";
import { setAgentPermission } from "@/commands/content";
import { useAgentPresences } from "@/services/agent-presence";
import {
  permissionOf,
  useAgentPermissions,
  useContentSuggestions,
} from "@/services/content-editing/suggestion-queries";
import { agentColorStyle, MAIN_AGENT_NAME } from "@/services/agent-identity";
import useSettingStore from "@/stores/useSettingStore";
import type { AgentPresence } from "@/types/agent-presence";
import type { AgentPermissionLevel } from "@/types/content-suggestion";
import { AgentAvatar, AgentName } from "./AgentAvatar";

const LEVELS: { value: AgentPermissionLevel; label: string }[] = [
  { value: "readonly", label: "只读" },
  { value: "suggest", label: "建议" },
  { value: "direct", label: "直接改" },
];

const LEVEL_HINT: Record<AgentPermissionLevel, string> = {
  readonly: "只能读，不能改这篇",
  suggest: "改动落成建议，等你接受",
  direct: "实时落地，事后可撤销",
};

/** 正在干活时的三点跳动，颜色随作者 */
function TypingDots({ agent }: { agent: string }) {
  return (
    <span aria-hidden className="inline-flex gap-[3px]" style={agentColorStyle(agent)}>
      {[0, 150, 300].map(delay => (
        <i
          key={delay}
          className="size-1 animate-pulse rounded-full bg-[var(--agent)]"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}

/** 胶囊里讲谁：先讲在等你的，再讲正在干活的 */
const leadingOf = (presences: AgentPresence[]) =>
  presences.find(item => item.status === "waiting") ??
  presences.find(item => item.status === "busy");

/** 这篇正文上的 Agent：此刻在场的在前，其余为设过权限或留过建议的 */
function useCollaborators(contentId: number | undefined, databaseName?: string) {
  const { data: presences } = useAgentPresences(contentId, databaseName);
  const { data: permissions } = useAgentPermissions(contentId, databaseName);
  const { data: suggestions } = useContentSuggestions(contentId, databaseName);
  return useMemo(() => {
    const present = presences ?? [];
    const names = [
      ...new Set([
        ...present.map(item => item.agent),
        ...(permissions ?? []).map(item => item.agent),
        ...(suggestions ?? []).map(item => item.agentLabel || MAIN_AGENT_NAME),
      ]),
    ].filter(Boolean);
    return {
      presences: present,
      permissions,
      agents: names.map(name => ({
        name,
        presence: present.find(item => item.agent === name),
      })),
    };
  }, [presences, permissions, suggestions]);
}

export function AgentCollaborators({
  contentId,
  databaseName,
  className,
}: {
  contentId?: number;
  databaseName?: string;
  className?: string;
}) {
  const active = useSettingStore(state => state.setting.database.active);
  const database = databaseName ?? active;
  const { presences, permissions, agents } = useCollaborators(contentId, database);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  if (!contentId || !agents.length) return null;
  const leading = leadingOf(presences);
  const change = async (agent: string, level: AgentPermissionLevel) => {
    setSaving(agent);
    try {
      await bindDatabaseCommands(
        { setAgentPermission },
        { databaseName: database }
      ).setAgentPermission(contentId, agent, level);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "权限保存失败");
    } finally {
      setSaving(null);
    }
  };
  return (
    <span className={cn("flex min-w-0 items-center gap-1.5", className)}>
      <Popover
        placement="bottom-end"
        arrow={false}
        className="w-[340px]"
        open={open}
        onOpenChange={setOpen}
        trigger={
          <button
            type="button"
            aria-label={`这篇的 Agent 协作者：${agents.map(item => item.name).join("、")}`}
            className="hover:bg-hover rounded-tau-sm flex h-[26px] flex-none cursor-pointer items-center px-1 [&>*+*]:-ml-1.5"
          >
            {agents.slice(0, 3).map(item => (
              <AgentAvatar
                key={item.name}
                name={item.name}
                size={20}
                status={item.presence?.status}
                className={cn("ring-surface ring-2", !item.presence && "opacity-70")}
              />
            ))}
          </button>
        }
      >
        <Popover.Header icon={<Users className="size-[15px]" strokeWidth={1.75} />}>
          这篇的协作者
        </Popover.Header>
        <Popover.Body>
          <div className="flex flex-col gap-3">
            {agents.map(item => {
              const level = permissionOf(permissions, item.name);
              return (
                <div key={item.name} className="flex items-center gap-2.5">
                  <AgentAvatar name={item.name} size={28} status={item.presence?.status} />
                  <div className="min-w-0 flex-1">
                    <div className="text-tau-sm">
                      <AgentName name={item.name} />
                    </div>
                    <div className="text-tau-meta text-ink-3 truncate">
                      {item.presence?.action || LEVEL_HINT[level]}
                    </div>
                  </div>
                  <Segmented<AgentPermissionLevel>
                    label={`${item.name}的权限`}
                    size="sm"
                    value={level}
                    disabled={saving === item.name}
                    onValueChange={value => void change(item.name, value)}
                  >
                    {LEVELS.map(option => (
                      <Segmented.Item
                        key={option.value}
                        value={option.value}
                        label={option.label}
                      />
                    ))}
                  </Segmented>
                </div>
              );
            })}
            <p className="text-tau-meta text-ink-3 m-0">
              「建议」在原对话中等你接受；「直接改」实时落地，你在它正改的段落里输入时它会停手。改动和撤销在原对话中查看。
            </p>
          </div>
        </Popover.Body>
      </Popover>
      {leading?.action ? (
        <span
          className="border-line-1 bg-surface text-tau-meta text-ink-2 flex h-6 max-w-[280px] min-w-0 items-center gap-1.5 overflow-hidden rounded-full border pr-2.5 pl-2 whitespace-nowrap"
          aria-live="polite"
          title={`${leading.agent} ${leading.action}`}
        >
          <span className="min-w-0 truncate">
            <AgentName name={leading.agent} /> {leading.action}
          </span>
          {leading.status === "busy" ? (
            <span className="flex-none">
              <TypingDots agent={leading.agent} />
            </span>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}
