import type {
  AgentMessage,
  AgentMessageContributor,
  AgentSkill,
} from "../types";

const formatSkillsList = (skills: AgentSkill[]) =>
  skills
    .map(
      (skill) =>
        `${skill.folderName} metadata:
  - Name: ${skill.name}
  - Description: ${skill.description || "无描述"}
  - Path: ${skill.path || "unknown"}`,
    )
    .join("\n");

const createSkillPromptMessage = (
  skills: AgentSkill[],
): AgentMessage | null => {
  if (skills.length === 0) {
    return null;
  }

  const skillsList = formatSkillsList(skills);

  return {
    role: "system",
    content: [
      {
        type: "text",
        text: [
          "## 可用 Skills",
          "",
          "以下是预定义的 Skills，当用户请求匹配相关场景时，请使用 `get_skill_readme` 工具获取详细说明：",
          "",
          skillsList,
        ].join("\n"),
      },
    ],
  };
};

export const createSkillMessageContributor = (
  skills: AgentSkill[],
): AgentMessageContributor => ({
  id: "agent-skill-prompt",
  order: 100,
  stage: "run-init",
  contribute(context) {
    const skillPromptMessage = createSkillPromptMessage(skills);
    if (!skillPromptMessage) {
      return;
    }

    const firstSystemIndex = context.state.messages.findIndex(
      (message) => message.role === "system",
    );

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
