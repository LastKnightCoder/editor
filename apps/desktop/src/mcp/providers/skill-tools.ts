import type { ToolParameterSchema } from "@/types";
import { listSkills, getSkillReadme, getSkillTree } from "@/commands/skill";
import type { MCPProviderDefinition } from "./types";

export const skillToolsProvider: MCPProviderDefinition = {
  id: "skill-tools",
  name: "Skill 工具",
  description:
    "提供 Skill 列表查询和 SKILL.md 内容获取工具。Skills 是预定义的知识和流程，教会模型如何完成特定任务。",
  defaultEnabled: true,
  tools: () => [
    {
      name: "list_skills",
      description:
        "获取所有可用的 Skills 列表。返回每个 Skill 的文件夹名、名称、描述和完整路径。" +
        "Skills 是预定义的知识和流程，教会模型如何完成特定任务。" +
        "使用此工具了解有哪些可用的 Skills，然后使用 get_skill_readme 获取详细说明。",
      parameters: {
        type: "object",
        properties: {} as Record<string, ToolParameterSchema>,
        required: [],
        additionalProperties: false,
      },
      executor: async () => {
        try {
          const skills = await listSkills();

          return {
            content: JSON.stringify(
              {
                success: true,
                count: skills.length,
                skills: skills.map((skill) => ({
                  folderName: skill.folderName,
                  name: skill.name,
                  description: skill.description,
                  path: skill.path,
                })),
              },
              null,
              2,
            ),
          };
        } catch (error) {
          return {
            content: JSON.stringify(
              {
                success: false,
                error: `获取 Skills 列表失败: ${(error as Error).message}`,
              },
              null,
              2,
            ),
          };
        }
      },
    },
    {
      name: "get_skill_readme",
      description:
        "获取指定 Skill 的 SKILL.md 内容。SKILL.md 包含该 Skill 的详细说明、" +
        "使用方法和相关知识。使用此工具了解如何执行特定任务。",
      parameters: {
        type: "object",
        properties: {
          folderName: {
            type: "string",
            description: "Skill 的文件夹名称，可通过 list_skills 获取",
          },
        } as Record<string, ToolParameterSchema>,
        required: ["folderName"],
        additionalProperties: false,
      },
      executor: async (args) => {
        const folderName = args.folderName as string;

        if (!folderName) {
          return {
            content: JSON.stringify(
              {
                success: false,
                error: "必须提供 folderName",
              },
              null,
              2,
            ),
          };
        }

        try {
          const result = await getSkillReadme(folderName);

          if (!result) {
            return {
              content: JSON.stringify(
                {
                  success: false,
                  error: "未找到指定的 Skill 或 SKILL.md 文件不存在",
                },
                null,
                2,
              ),
            };
          }

          return {
            content: JSON.stringify(
              {
                success: true,
                skillName: result.name,
                content: result.readmeContent,
              },
              null,
              2,
            ),
          };
        } catch (error) {
          return {
            content: JSON.stringify(
              {
                success: false,
                error: `获取 SKILL.md 失败: ${(error as Error).message}`,
              },
              null,
              2,
            ),
          };
        }
      },
    },
    {
      name: "get_skill_tree",
      description:
        "以树形结构展示指定 Skill 的文件和目录结构，类似于 tree 命令的输出。" +
        "这对于了解 Skill 的组织结构和包含的文件非常有用。",
      parameters: {
        type: "object",
        properties: {
          folderName: {
            type: "string",
            description: "Skill 的文件夹名称，可通过 list_skills 获取",
          },
        } as Record<string, ToolParameterSchema>,
        required: ["folderName"],
        additionalProperties: false,
      },
      executor: async (args) => {
        const folderName = args.folderName as string;

        if (!folderName) {
          return {
            content: JSON.stringify(
              {
                success: false,
                error: "必须提供 folderName",
              },
              null,
              2,
            ),
          };
        }

        try {
          const treeString = await getSkillTree(folderName);

          // 直接返回树形结构文本，不使用 JSON.stringify 避免换行符被转义
          return {
            content: treeString,
          };
        } catch (error) {
          return {
            content: JSON.stringify(
              {
                success: false,
                error: `获取 Skill 树形结构失败: ${(error as Error).message}`,
              },
              null,
              2,
            ),
          };
        }
      },
    },
  ],
};
