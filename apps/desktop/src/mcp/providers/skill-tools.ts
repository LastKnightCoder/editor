import type { ToolParameterSchema, Skill } from "@/types";
import {
  listSkills,
  getSkillReadme,
  getSkillTree,
  getSkillsDir,
  readSkillFile,
} from "@/commands/skill";
import {
  isInternalSkill,
  getInternalSkill,
  getAllInternalSkills,
} from "@/constants/internal-skills";
import type { MCPProviderDefinition } from "./types";

/**
 * 获取合并后的所有 Skills（内部 + 外部）
 */
async function getMergedSkills(): Promise<Skill[]> {
  // 获取外部 skill
  const externalSkills = await listSkills();

  // 获取内部 skill 并转换为 Skill 类型
  const internalSkills: Skill[] = getAllInternalSkills().map((skill) => ({
    folderName: skill.folderName,
    name: skill.name,
    description: skill.description,
    path: `internal://${skill.folderName}`,
    isInternal: true,
    readmeContent: skill.readmeContent,
  }));

  // 合并内部和外部 skill（内部优先，同名时跳过外部）
  const internalFolderNames = new Set(internalSkills.map((s) => s.folderName));
  const filteredExternalSkills = externalSkills.filter(
    (s) => !internalFolderNames.has(s.folderName),
  );

  return [...internalSkills, ...filteredExternalSkills];
}

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
          const skills = await getMergedSkills();

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
                  isInternal: skill.isInternal ?? false,
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
          // 检查是否为内部 skill
          if (isInternalSkill(folderName)) {
            const internalSkill = getInternalSkill(folderName);
            if (!internalSkill) {
              return {
                content: JSON.stringify(
                  {
                    success: false,
                    error: "未找到指定的内部 Skill",
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
                  skillName: internalSkill.name,
                  content: internalSkill.readmeContent,
                  isInternal: true,
                },
                null,
                2,
              ),
            };
          }

          // 外部 skill 保持原有逻辑
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
                isInternal: false,
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
          // 检查是否为内部 skill
          if (isInternalSkill(folderName)) {
            const internalSkill = getInternalSkill(folderName);
            if (!internalSkill) {
              return {
                content: JSON.stringify(
                  {
                    success: false,
                    error: "未找到指定的内部 Skill",
                  },
                  null,
                  2,
                ),
              };
            }

            // 返回虚拟的目录结构
            const treeString = `${folderName}/ [内置]\n└── SKILL.md`;
            return {
              content: treeString,
            };
          }

          // 外部 skill 保持原有逻辑
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
    {
      name: "read_skill_file",
      description:
        "通过相对路径读取指定 Skill 目录下的文件内容。" +
        "例如，要读取 my-skill 目录下的 templates/example.md 文件，" +
        "传入 folderName='my-skill' 和 relativePath='templates/example.md'。",
      parameters: {
        type: "object",
        properties: {
          folderName: {
            type: "string",
            description: "Skill 的文件夹名称，可通过 list_skills 获取",
          },
          relativePath: {
            type: "string",
            description:
              "相对于 Skill 目录的文件路径，如 'templates/example.md'",
          },
        } as Record<string, ToolParameterSchema>,
        required: ["folderName", "relativePath"],
        additionalProperties: false,
      },
      executor: async (args) => {
        const folderName = args.folderName as string;
        const relativePath = args.relativePath as string;

        if (!folderName || !relativePath) {
          return {
            content: JSON.stringify(
              {
                success: false,
                error: "必须提供 folderName 和 relativePath",
              },
              null,
              2,
            ),
          };
        }

        try {
          // 检查是否为内部 skill
          if (isInternalSkill(folderName)) {
            const internalSkill = getInternalSkill(folderName);
            if (!internalSkill) {
              return {
                content: JSON.stringify(
                  {
                    success: false,
                    error: "未找到指定的内部 Skill",
                  },
                  null,
                  2,
                ),
              };
            }

            // 内部 skill 只支持读取 SKILL.md
            if (relativePath === "SKILL.md" || relativePath === "./SKILL.md") {
              return {
                content: JSON.stringify(
                  {
                    success: true,
                    folderName,
                    relativePath,
                    fullPath: `internal://${folderName}/SKILL.md`,
                    content: internalSkill.readmeContent,
                    isInternal: true,
                  },
                  null,
                  2,
                ),
              };
            }

            return {
              content: JSON.stringify(
                {
                  success: false,
                  folderName,
                  relativePath,
                  error: "内置 Skill 只包含 SKILL.md 文件",
                },
                null,
                2,
              ),
            };
          }

          // 外部 skill 保持原有逻辑
          const skillsDir = await getSkillsDir();
          const fullPath = `${skillsDir}/${folderName}/${relativePath}`;
          const content = await readSkillFile(fullPath);

          return {
            content: JSON.stringify(
              {
                success: true,
                folderName,
                relativePath,
                fullPath,
                content,
                isInternal: false,
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
                folderName,
                relativePath,
                error: `读取文件失败: ${(error as Error).message}`,
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
