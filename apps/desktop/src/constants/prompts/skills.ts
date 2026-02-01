import { listSkills } from "@/commands/skill";
import type { Skill } from "@/types";

// 生成 Skill 元信息的系统 Prompt 片段
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

// 格式化 Skills 列表
function formatSkillsList(skills: Skill[]): string {
  return skills
    .map((skill) => `- **${skill.name}**: ${skill.description || "无描述"}`)
    .join("\n");
}

// 同步版本：使用已加载的 skills 数据生成 prompt
export function buildSkillPromptSync(skills: Skill[]): string {
  if (skills.length === 0) return "";

  const skillsList = formatSkillsList(skills);

  return `
## 可用 Skills

以下是预定义的 Skills，当用户请求匹配相关场景时，请使用 \`get_skill_readme\` 工具获取详细说明：

${skillsList}
`;
}
