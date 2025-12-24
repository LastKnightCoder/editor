export interface Skill {
  folderName: string;
  name: string;
  description: string;
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
