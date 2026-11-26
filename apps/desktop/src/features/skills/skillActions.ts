import { skillsFeedback, skillsTranslator } from "./i18n";
import type { TranslationValues } from "@tau/i18n";
/**
 * Skill 页的跨视图动作。
 */

import { toast } from "@tau/ui";
import { commitSkillImport, inspectSkillImport } from "@/commands/skill";
import useSkillStore from "@/stores/useSkillStore";
import { splitSkillDocument } from "@/utils/skill-frontmatter";
import type { Skill } from "@/types";

class SkillCopyError extends Error {
  constructor(
    readonly code: "missing-readme" | "conflict",
    message: string,
    readonly values: TranslationValues = {}
  ) {
    super(message);
  }
}

/**
 * 只读 Skill 复制为「我的」：关联目录整目录复制（含脚本与参考资料）；内置按正文新建。
 * 内置复制后停用原件，避免同一份说明被 AI 看到两遍；关联目录同名时「我的」优先，原件自然被遮蔽。
 */
export async function copySkillToMine(skill: Skill): Promise<void> {
  const store = useSkillStore.getState();
  try {
    if (skill.readmeContent !== undefined) {
      const { body } = splitSkillDocument(skill.readmeContent ?? "");
      await store.createSkill({ name: skill.name, description: skill.description, body });
    } else {
      const inspection = await inspectSkillImport({ type: "folder", path: skill.path });
      const [candidate] = inspection.candidates;
      if (!candidate) throw new SkillCopyError("missing-readme", "没有找到 SKILL.md");
      if (candidate.exists) {
        throw new SkillCopyError(
          "conflict",
          `「我的」里已有同名 Skill「${candidate.folderName}」`,
          { folder: candidate.folderName }
        );
      }
      await commitSkillImport(inspection.token, [{ relPath: candidate.relPath }]);
      await store.loadSkills();
    }
    if (skill.readmeContent !== undefined) {
      store.setEnabled(skill.folderName, false);
      toast.success(...skillsFeedback("skills.copy.doneDisabled"));
    } else {
      toast.success(...skillsFeedback("skills.copy.done"));
    }
  } catch (error) {
    const reason = () =>
      error instanceof SkillCopyError
        ? skillsTranslator.t(
            error.code === "missing-readme" ? "skills.copy.missingReadme" : "skills.copy.conflict",
            error.values
          )
        : error instanceof Error
          ? error.message
          : String(error);
    const message = () => skillsTranslator.t("skills.copy.failed", { reason: reason() });
    toast.error(message(), { getMessage: message });
  }
}
