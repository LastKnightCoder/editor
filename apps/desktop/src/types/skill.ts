// Skill 元信息（存储在 SKILL.md 的 front-matter 中）
export interface SkillMeta {
  name: string;
  description: string;
}

export interface Skill extends SkillMeta {
  folderName: string;
  path: string;
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
