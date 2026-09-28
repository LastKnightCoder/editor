import useSkillStore, {
  dedupeSkills,
  getSkillInvocation,
  isSkillEnabled,
} from "@/stores/useSkillStore";
import type { Skill } from "@/types";

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
