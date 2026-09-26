/**
 * Skill 页的跨视图动作。
 */

import { toast } from "@tau/ui";
import { commitSkillImport, inspectSkillImport } from "@/commands/skill";
import useSkillStore from "@/stores/useSkillStore";
import { splitSkillDocument } from "@/utils/skill-frontmatter";
import type { Skill } from "@/types";

/**
 * 只读 Skill 复制为「我的」：关联目录整目录复制（含脚本与参考资料）；内置按正文新建。
 * 内置复制后停用原件，避免同一份说明被 AI 看到两遍；关联目录同名时「我的」优先，原件自然被遮蔽。
 */
export async function copySkillToMine(skill: Skill): Promise<void> {
  const store = useSkillStore.getState();
  try {
    if (skill.isInternal) {
      const { body } = splitSkillDocument(skill.readmeContent ?? "");
      await store.createSkill({ name: skill.name, description: skill.description, body });
    } else {
      const inspection = await inspectSkillImport({ type: "folder", path: skill.path });
      const [candidate] = inspection.candidates;
      if (!candidate) throw new Error("没有找到 SKILL.md");
      if (candidate.exists) {
        throw new Error(`「我的」里已有同名 Skill「${candidate.folderName}」`);
      }
      await commitSkillImport(inspection.token, [{ relPath: candidate.relPath }]);
      await store.loadSkills();
    }
    if (skill.isInternal) {
      store.setEnabled(skill.folderName, false);
      toast.success("已复制为「我的」Skill，内置原件已停用");
    } else {
      toast.success("已复制为「我的」Skill");
    }
  } catch (error) {
    toast.error(`复制失败：${(error as Error).message}`);
  }
}
