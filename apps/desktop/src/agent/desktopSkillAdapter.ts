import type { AgentSkill } from "@tau/agent";

import { getSkillReadme, getSkillTree, readSkillFile } from "@/commands/skill";
import useSkillStore, {
  dedupeSkills,
  getSkillInvocation,
  isSkillEnabled,
} from "@/stores/useSkillStore";
import type { Skill } from "@/types";

const normalizeRelativePath = (relativePath: string) =>
  relativePath.replace(/\\/g, "/").replace(/^\.?\//, "");

/**
 * 交给 agent 的 Skill：同名去重后，去掉停用的；仅手动的只在本条消息点名时保留。
 * 偏好读自 useSkillStore（本机），不改原文件。
 */
export const resolveAgentSkills = (skills: Skill[], forced: string[] = []): Skill[] => {
  const { preferences } = useSkillStore.getState();
  return dedupeSkills(skills).filter(skill => {
    if (!isSkillEnabled(skill, preferences)) return false;
    return getSkillInvocation(skill, preferences) === "auto" || forced.includes(skill.folderName);
  });
};

export const toAgentSkill = (
  skill: Skill,
  options?: { forced?: string[]; conversationKey?: string }
): AgentSkill => {
  const forced = options?.forced?.includes(skill.folderName) ?? false;
  let recorded = false;
  // 使用记录：AI 读取 SKILL.md 记为自动；点名注入记为手动（每轮每个 Skill 只记一次）
  const record = () => {
    if (recorded) return;
    recorded = true;
    useSkillStore
      .getState()
      .recordUsage(skill.folderName, forced ? "manual" : "auto", options?.conversationKey);
  };

  return {
    id: skill.folderName,
    folderName: skill.folderName,
    name: skill.name,
    description: skill.description,
    path: skill.path,
    loadReadme: async () => {
      record();
      if (skill.readmeContent) return skill.readmeContent;
      const content = await getSkillReadme(skill.path);
      if (!content) throw new Error(`未找到 Skill ${skill.folderName} 的 SKILL.md`);
      return content;
    },
    loadTree: async () => {
      if (skill.isInternal) return `${skill.folderName}/ [内置]\n└── SKILL.md`;
      return getSkillTree(skill.path);
    },
    readFile: async relativePath => {
      const normalizedPath = normalizeRelativePath(relativePath);
      if (normalizedPath.split("/").includes(".."))
        throw new Error("只能读取该 Skill 目录内的文件");
      if (skill.isInternal) {
        if (normalizedPath === "SKILL.md" && skill.readmeContent) return skill.readmeContent;
        throw new Error("内置 Skill 只包含 SKILL.md 文件");
      }
      return readSkillFile(`${skill.path}/${normalizedPath}`);
    },
  };
};

export const toAgentSkills = (
  skills: Skill[],
  options?: { forced?: string[]; conversationKey?: string }
): AgentSkill[] => skills.map(skill => toAgentSkill(skill, options));
