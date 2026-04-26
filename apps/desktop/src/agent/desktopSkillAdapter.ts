import type { AgentSkill } from "@tau/agent";

import {
  getSkillReadme,
  getSkillTree,
  getSkillsDir,
  readSkillFile,
} from "@/commands/skill";
import type { Skill } from "@/types";

const normalizeRelativePath = (relativePath: string) =>
  relativePath.replace(/\\/g, "/").replace(/^\.?\//, "");

export const toAgentSkill = (skill: Skill): AgentSkill => ({
  id: skill.folderName,
  folderName: skill.folderName,
  name: skill.name,
  description: skill.description,
  path: skill.path,
  readmeContent: skill.readmeContent,
  loadReadme: async () => {
    if (skill.readmeContent) {
      return skill.readmeContent;
    }

    const detail = await getSkillReadme(skill.folderName);
    if (!detail?.readmeContent) {
      throw new Error(`未找到 Skill ${skill.folderName} 的 SKILL.md`);
    }

    return detail.readmeContent;
  },
  loadTree: async () => {
    if (skill.isInternal) {
      return `${skill.folderName}/ [内置]\n└── SKILL.md`;
    }

    return getSkillTree(skill.folderName);
  },
  readFile: async (relativePath) => {
    const normalizedPath = normalizeRelativePath(relativePath);
    if (skill.isInternal) {
      if (normalizedPath === "SKILL.md" && skill.readmeContent) {
        return skill.readmeContent;
      }
      throw new Error("内置 Skill 只包含 SKILL.md 文件");
    }

    const skillsDir = await getSkillsDir();
    return readSkillFile(`${skillsDir}/${skill.folderName}/${normalizedPath}`);
  },
});

export const toAgentSkills = (skills: Skill[]): AgentSkill[] =>
  skills.map(toAgentSkill);
