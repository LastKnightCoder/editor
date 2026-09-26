import type { AgentMessage, AgentMessageContributor, AgentSkill } from "../types";

const formatSkillsList = (skills: AgentSkill[]) =>
  skills
    .map(
      skill =>
        `${skill.folderName} metadata:
  - Name: ${skill.name}
  - Description: ${skill.description || "无描述"}
  - Path: ${skill.path || "unknown"}`
    )
    .join("\n");

/** 本轮由用户点名（`$`）的 Skill：run 请求 metadata.forcedSkillIds（folderName 列表） */
export const getForcedSkillIds = (metadata: Record<string, unknown> | undefined): string[] => {
  const ids = metadata?.forcedSkillIds;
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
};

const loadReadme = async (skill: AgentSkill): Promise<string> => {
  if (typeof skill.readme === "string") return skill.readme;
  if (typeof skill.readmeContent === "string") return skill.readmeContent;
  if (skill.loadReadme) return skill.loadReadme();
  return "";
};

const createSkillPromptMessage = async (
  skills: AgentSkill[],
  forcedIds: string[]
): Promise<AgentMessage | null> => {
  const forced = skills.filter(skill => forcedIds.includes(skill.folderName));
  const listed = skills.filter(skill => !forcedIds.includes(skill.folderName));
  if (listed.length === 0 && forced.length === 0) {
    return null;
  }

  const sections: string[] = [];
  if (listed.length > 0) {
    sections.push(
      "## 可用 Skills",
      "",
      "以下是预定义的 Skills，当用户请求匹配相关场景时，请使用 `get_skill_readme` 工具获取详细说明：",
      "",
      formatSkillsList(listed)
    );
  }

  if (forced.length > 0) {
    const bodies = await Promise.all(
      forced.map(async skill => {
        let content = "";
        try {
          content = await loadReadme(skill);
        } catch (error) {
          content = `（读取 SKILL.md 失败：${(error as Error).message}）`;
        }
        return `### ${skill.name}（${skill.folderName}）\n\n${content}`;
      })
    );
    if (sections.length > 0) sections.push("");
    sections.push(
      "## 本轮指定的 Skills",
      "",
      "用户在本条消息里用 `$` 点名了以下 Skill，请按其说明完成任务；附带的其它文件可用 `read_skill_file` 读取，脚本可用 `run_skill_script` 执行：",
      "",
      ...bodies
    );
  }

  return {
    role: "system",
    content: [
      {
        type: "text",
        text: sections.join("\n"),
      },
    ],
  };
};

export const createSkillMessageContributor = (skills: AgentSkill[]): AgentMessageContributor => ({
  id: "agent-skill-prompt",
  order: 100,
  stage: "run-init",
  async contribute(context) {
    const skillPromptMessage = await createSkillPromptMessage(
      skills,
      getForcedSkillIds(context.state.metadata)
    );
    if (!skillPromptMessage) {
      return;
    }

    const firstSystemIndex = context.state.messages.findIndex(message => message.role === "system");

    if (firstSystemIndex === -1) {
      context.state.messages = [skillPromptMessage, ...context.state.messages];
      return;
    }

    context.state.messages = [
      ...context.state.messages.slice(0, firstSystemIndex + 1),
      skillPromptMessage,
      ...context.state.messages.slice(firstSystemIndex + 1),
    ];
  },
});
