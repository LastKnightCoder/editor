import type { AiSkillSource } from "@tau/ai/skills";
import { INTERNAL_SKILLS } from "@tau/ai/skills/internal";

export const INTERNAL_SKILL_SOURCE_ID = "internal";

/** 内置 Skill 正文不带 frontmatter，供给运行时前补上名称与说明（JSON 字符串即合法 YAML 标量） */
const document = (skill: (typeof INTERNAL_SKILLS)[number]) =>
  [
    "---",
    `name: ${JSON.stringify(skill.name)}`,
    `description: ${JSON.stringify(skill.description)}`,
    "---",
    skill.readmeContent,
  ].join("\n");

/** 内置 Skill 来源：与桌面同一份正文，路径为 <目录名>/SKILL.md */
export const internalSkillSource: AiSkillSource = {
  id: INTERNAL_SKILL_SOURCE_ID,
  revision: "1",
  list: async () =>
    INTERNAL_SKILLS.map(skill => ({ id: skill.folderName, path: `${skill.folderName}/SKILL.md` })),
  read: async path => {
    const skill = INTERNAL_SKILLS.find(item => `${item.folderName}/SKILL.md` === path);
    if (!skill) throw new Error("内置技能没有该资料");
    return document(skill);
  },
};
