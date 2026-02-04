import { listSkills } from "@/commands/skill";
import type { Skill } from "@/types";

export async function buildSkillPrompt(): Promise<string> {
  try {
    const skills = await listSkills();

    if (skills.length === 0) return "";

    const skillsList = formatSkillsList(skills);

    return `
## 可用 Skills

以下是预定义的 Skills，当用户请求匹配相关场景时，请使用 \`get_skill_readme\` 工具获取详细说明：

${skillsList}
`;
  } catch (error) {
    console.error("Failed to build skill prompt:", error);
    return "";
  }
}

function formatSkillsList(skills: Skill[]): string {
  return skills
    .map(
      (skill) =>
        `${skill.folderName} metadata:
  - Name: ${skill.name}
  - Description: ${skill.description || "无描述"}
  - Path: ${skill.path}
`,
    )
    .join("\n");
}

export function buildSkillPromptSync(skills: Skill[]): string {
  if (skills.length === 0) return "";

  const skillsList = formatSkillsList(skills);

  return `
## 可用 Skills

以下是预定义的 Skills，当用户请求匹配相关场景时，请使用 \`get_skill_readme\` 工具获取详细说明：

${skillsList}
`;
}
