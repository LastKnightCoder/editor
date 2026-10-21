/**
 * Skill 页数据层：把 useSkillStore 的 Skill + 本机偏好 + 使用记录拼成页面条目，
 * 并算出状态（停用 / 自动 / 仅手动）、问题提示与常驻上下文预算。
 */

import { useEffect, useMemo } from "react";
import useSkillStore, {
  dedupeSkills,
  getSkillInvocation,
  isSkillEnabled,
  type SkillUsage,
} from "@/stores/useSkillStore";
import type { Skill, SkillInvocation, SkillSource } from "@/types";
import { estimateTokens } from "@/utils/skill-frontmatter";

/** 描述超过这个 tokens 数标黄：每次对话都要带上它 */
export const LONG_DESCRIPTION_TOKENS = 150;

export type SkillMode = SkillInvocation | "off";

export interface SkillItem {
  skill: Skill;
  key: string;
  source: SkillSource;
  enabled: boolean;
  invocation: SkillInvocation;
  mode: SkillMode;
  /** 被同名更高优先级的 Skill 遮蔽（内置 > 我的 > 关联目录） */
  shadowed: boolean;
  /** 自动模式下常驻系统提示词的 tokens（名称 + 描述） */
  tokens: number;
  warning?: { level: "danger" | "warn"; text: string };
  usage?: SkillUsage;
  readonly: boolean;
}

export const skillKey = (skill: Skill) => `${skill.source ?? "mine"}:${skill.path}`;

export function toSkillItems(
  skills: Skill[],
  preferences: Parameters<typeof getSkillInvocation>[1],
  usage: Record<string, SkillUsage>
): SkillItem[] {
  const winners = new Set(dedupeSkills(skills));
  return skills.map(skill => {
    const enabled = isSkillEnabled(skill, preferences);
    const invocation = getSkillInvocation(skill, preferences);
    const shadowed = !winners.has(skill);
    const tokens = estimateTokens(`${skill.name} ${skill.description}`);
    let warning: SkillItem["warning"];
    if (shadowed) warning = { level: "warn", text: "与更高优先级的同名 Skill 冲突，不会生效" };
    else if (!skill.description.trim())
      warning = { level: "danger", text: "缺少描述，AI 无法判断何时使用它" };
    else if (invocation === "auto" && tokens > LONG_DESCRIPTION_TOKENS)
      warning = { level: "warn", text: `描述偏长（约 ${tokens} tokens），建议把细则移到正文` };
    return {
      skill,
      key: skillKey(skill),
      source: skill.source ?? "mine",
      enabled,
      invocation,
      mode: enabled ? invocation : "off",
      shadowed,
      tokens,
      warning,
      usage: usage[skill.folderName],
      readonly: skill.source !== "mine",
    };
  });
}

export function useSkillItems() {
  const skills = useSkillStore(s => s.skills);
  const preferences = useSkillStore(s => s.preferences);
  const usage = useSkillStore(s => s.usage);
  const loaded = useSkillStore(s => s.loaded);
  const loading = useSkillStore(s => s.loading);

  useEffect(() => {
    void useSkillStore.getState().loadSkills();
  }, []);

  const items = useMemo(
    () => toSkillItems(skills, preferences, usage),
    [skills, preferences, usage]
  );

  const budget = useMemo(() => {
    const active = items.filter(i => i.mode === "auto" && !i.shadowed);
    const total = active.reduce((n, i) => n + i.tokens, 0);
    const long = active.filter(i => i.tokens > LONG_DESCRIPTION_TOKENS);
    return {
      total,
      count: active.length,
      longTokens: long.reduce((n, i) => n + i.tokens, 0),
      longCount: long.length,
    };
  }, [items]);

  return { items, budget, loaded, loading };
}

/** 调用方式三态写回偏好 */
export function setSkillMode(skill: Skill, mode: SkillMode) {
  const store = useSkillStore.getState();
  if (mode === "off") store.setEnabled(skill.folderName, false);
  else store.setInvocation(skill.folderName, mode);
}

export const SOURCE_LABEL: Record<SkillSource, string> = {
  mine: "我的",
  builtin: "内置",
  plugin: "插件",
  package: "Skill 包",
  linked: "关联目录",
};

export const MODE_OPTIONS: Array<{ value: SkillMode; label: string; description: string }> = [
  { value: "auto", label: "自动", description: "AI 按描述自行决定何时加载" },
  { value: "manual", label: "仅手动", description: "只在输入框用 $ 点名时加载，不占提示词" },
  { value: "off", label: "停用", description: "AI 完全看不到这个 Skill" },
];

export const linkedDirLabel = (skill: Skill) => {
  const root = skill.rootPath ?? "";
  if (root.includes("/.claude/")) return "Claude Code";
  if (root.includes("/.codex/")) return "Codex";
  if (root.includes("/.agents/")) return "Agent Skills";
  return root.split("/").filter(Boolean).slice(-2).join("/");
};
