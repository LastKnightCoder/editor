import type { InternalSkill } from "@/types";
import { INTERNAL_SKILLS } from "@tau/ai/skills/internal";

// 内部 Skill 注册表：正文与清单在 @tau/ai/skills/internal，桌面与移动共用
const internalSkillRegistry = new Map<string, InternalSkill>(
  INTERNAL_SKILLS.map(skill => [skill.folderName, { ...skill, isInternal: true }])
);

export const isInternalSkill = (folderName: string): boolean =>
  internalSkillRegistry.has(folderName);

export const getInternalSkill = (folderName: string): InternalSkill | undefined =>
  internalSkillRegistry.get(folderName);

export const getAllInternalSkills = (): InternalSkill[] =>
  Array.from(internalSkillRegistry.values());

export const getInternalSkillFolderNames = (): string[] => Array.from(internalSkillRegistry.keys());
