// Skill 元信息（存储在 SKILL.md 的 front-matter 中）
export interface SkillMeta {
  name: string;
  description: string;
}

export interface Skill extends SkillMeta {
  folderName: string;
  path: string;
  isInternal?: boolean; // 是否为内部 skill
  readmeContent?: string; // 内部 skill 的 SKILL.md 内容
}

// 内部 Skill 类型（代码中预定义的 skill）
export interface InternalSkill {
  folderName: string; // 唯一标识
  name: string;
  description: string;
  readmeContent: string; // SKILL.md 的完整内容
  isInternal: true;
}

export interface SkillFile {
  name: string;
  path: string;
  isDirectory: boolean;
  isMarkdown: boolean;
}

export interface SkillDetail extends Skill {
  readmeContent: string;
  files: SkillFile[];
}
