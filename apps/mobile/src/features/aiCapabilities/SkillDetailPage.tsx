// Skill 详情：使用方式（自动 / 仅手动 / 停用）、只读正文、来源。
// 带脚本的 Skill 包在手机端只读取说明与参考资料。

import { useState } from "react";
import { ChevronRight, ExternalLink } from "lucide-react";
import { MarkdownRenderer } from "@tau/chat-ui/conversation";
import { useThemeStore } from "@tau/themes/react";
import { BottomSheet } from "../../components/BottomSheet";
import { CheckBubble } from "../../components/CheckBubble";
import { GroupLabel } from "../../components/GroupLabel";
import { toast } from "../../components/toast";
import { useNavigator } from "../../router";
import {
  skillModeOf,
  useCapabilityPreferences,
  useLibraryPreferences,
  type SkillMode,
} from "../../services/aiChat/capabilityPreferences";
import { GroupCard, GroupNote, GroupRow } from "../settings/components/ui";
import { useSkillCatalog, useSkillDocument } from "./data";
import { SkillIcon } from "./SkillsPage";
import { CapabilityPage } from "./ui";

const MODES: { mode: SkillMode; label: string; desc: string }[] = [
  {
    mode: "auto",
    label: "自动",
    desc: "AI 根据描述判断何时需要，自己读取正文。适合常用、描述清楚的 Skill。",
  },
  {
    mode: "manual",
    label: "仅手动",
    desc: "只在输入框「＋ › 选择 Skill」里选中时使用，不占每轮对话的上下文。",
  },
  { mode: "off", label: "停用", desc: "AI 和「选择 Skill」里都看不到它。" },
];

const KIND_LABEL = { internal: "内置 · 随应用更新", plugin: "插件提供", skills: "Skill 包" };

export function SkillDetailPage(props: { skillId: string }) {
  const navigator = useNavigator();
  const { databaseName, query, items } = useSkillCatalog();
  const item = items.find(value => value.skill.id === props.skillId);
  const preferences = useLibraryPreferences(databaseName);
  const setSkillMode = useCapabilityPreferences(state => state.setSkillMode);
  const document = useSkillDocument(databaseName, props.skillId);
  const isDark = useThemeStore(state => state.mode === "dark");
  const [picking, setPicking] = useState(false);
  const [expanded, setExpanded] = useState(false);

  if (!item) {
    return (
      <CapabilityPage title="Skill">
        <p className="text-ink-3 text-tau-meta px-8 py-16 text-center">
          {query.isPending ? "正在读取…" : "这个 Skill 已不可用，可能来源插件已停用或卸载。"}
        </p>
      </CapabilityPage>
    );
  }
  const { skill } = item;
  const mode = skillModeOf(preferences, skill);
  const current = MODES.find(value => value.mode === mode) ?? MODES[0];
  const tokens = Math.ceil((skill.name.length + skill.description.length) / 1.6);

  return (
    <CapabilityPage>
      <div className="flex items-center gap-3 px-1 pt-1 pb-1">
        <SkillIcon kind={item.kind} large />
        <span className="min-w-0 flex-1">
          <span className="text-ink-1 block truncate text-[19px] font-extrabold">{skill.name}</span>
          <span className="text-ink-3 text-tau-sm block truncate">
            {item.sourceName ? `${item.sourceName} · ` : ""}
            {KIND_LABEL[item.kind]}
          </span>
        </span>
      </div>
      <p className="text-ink-2 text-tau-sm px-1 leading-relaxed">{skill.description}</p>

      <GroupLabel>使用方式</GroupLabel>
      <GroupCard>
        <GroupRow onClick={() => setPicking(true)}>
          <span className="min-w-0 flex-1">
            <span className="text-ink-1 text-tau-body block font-medium">{current.label}</span>
          </span>
          <ChevronRight size={16} className="text-ink-3 shrink-0" aria-hidden="true" />
        </GroupRow>
      </GroupCard>
      {mode === "auto" && (
        <GroupNote>自动模式下，名称与描述（约 {tokens} tokens）会随每轮对话发送。</GroupNote>
      )}

      <GroupLabel>正文</GroupLabel>
      <div className="bg-surface relative overflow-hidden rounded-2xl px-3.5 py-3">
        {document.isPending && <p className="text-ink-3 text-tau-sm py-2">正在读取正文…</p>}
        {document.isError && (
          <p className="text-ink-3 text-tau-sm py-2">
            正文读取失败
            <button
              type="button"
              className="text-accent-text ml-3"
              onClick={() => void document.refetch()}
            >
              重试
            </button>
          </p>
        )}
        {document.data && (
          <div className={expanded ? undefined : "max-h-[220px] overflow-hidden"}>
            <MarkdownRenderer content={document.data.instructions} isDark={isDark} />
          </div>
        )}
        {document.data && !expanded && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-b from-transparent to-[var(--tau-bg-surface)]" />
        )}
      </div>
      {document.data && (
        <button
          type="button"
          className="text-accent-text text-tau-sm w-full py-2 text-center font-semibold"
          onClick={() => setExpanded(value => !value)}
        >
          {expanded ? "收起" : "查看完整正文"}
        </button>
      )}
      {item.kind === "skills" && (
        <GroupNote>手机端只读取说明与参考资料，Skill 包里的脚本不会运行。</GroupNote>
      )}

      {item.kind !== "internal" && (
        <>
          <GroupLabel>来源</GroupLabel>
          <GroupCard>
            <GroupRow onClick={() => navigator.push("pluginDetail", { pluginId: skill.sourceId })}>
              <span className="min-w-0 flex-1">
                <span className="text-ink-1 text-tau-body block font-medium">
                  {item.sourceName ?? skill.sourceId}
                </span>
                <span className="text-ink-3 text-tau-sm block">更新、停用、卸载在插件中心进行</span>
              </span>
              <ExternalLink size={15} className="text-ink-3 shrink-0" aria-hidden="true" />
            </GroupRow>
          </GroupCard>
        </>
      )}

      <BottomSheet open={picking} title="使用方式" onClose={() => setPicking(false)}>
        <div className="space-y-2 px-4 pb-5">
          {MODES.map(option => (
            <button
              key={option.mode}
              type="button"
              aria-pressed={option.mode === mode}
              className={`bg-surface flex w-full items-start gap-3 rounded-2xl border-[1.5px] px-3.5 py-3 text-left ${
                option.mode === mode ? "border-accent" : "border-transparent"
              }`}
              onClick={() => {
                setSkillMode(databaseName, skill, option.mode);
                setPicking(false);
                if (option.mode !== mode) toast.success(`已改为${option.label}`);
              }}
            >
              <span className="min-w-0 flex-1">
                <span className="text-ink-1 text-tau-body block font-semibold">{option.label}</span>
                <span className="text-ink-3 text-tau-sm mt-0.5 block leading-relaxed">
                  {option.desc}
                </span>
              </span>
              {option.mode === mode ? (
                <CheckBubble />
              ) : (
                <span className="border-line-1 h-[22px] w-[22px] shrink-0 rounded-full border-[1.5px]" />
              )}
            </button>
          ))}
          <p className="text-ink-3 text-tau-sm px-1 pt-1">只在这台手机上生效，不随数据库同步。</p>
        </div>
      </BottomSheet>
    </CapabilityPage>
  );
}
