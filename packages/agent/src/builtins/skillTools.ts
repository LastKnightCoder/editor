import type { AgentSkill, AgentTool, AgentToolExecutionResult } from "../types";

const SKILL_README_PATHS = new Set(["SKILL.md", "./SKILL.md"]);

const formatSuccess = (
  payload: Record<string, unknown>,
): AgentToolExecutionResult => ({
  content: JSON.stringify(
    {
      success: true,
      ...payload,
    },
    null,
    2,
  ),
});

const formatError = (message: string): AgentToolExecutionResult => ({
  content: JSON.stringify(
    {
      success: false,
      error: message,
    },
    null,
    2,
  ),
});

type SkillTreeNode = {
  children: Map<string, SkillTreeNode>;
  isFile?: boolean;
};

const createSkillTreeNode = (): SkillTreeNode => ({
  children: new Map(),
});

const normalizeRelativePath = (path: string) =>
  path.replace(/\\/g, "/").replace(/^\.?\//, "");

const resolveReadme = async (skill: AgentSkill): Promise<string | null> => {
  if (typeof skill.readme === "string") {
    return skill.readme;
  }

  if (typeof skill.readmeContent === "string") {
    return skill.readmeContent;
  }

  if (skill.loadReadme) {
    return skill.loadReadme();
  }

  return null;
};

const ensureSkill = (
  skillsByFolderName: Map<string, AgentSkill>,
  folderName: string,
) => {
  const skill = skillsByFolderName.get(folderName);
  if (!skill) {
    return {
      error: formatError("未找到指定的 Skill"),
    };
  }

  return { skill };
};

const createTreeLines = (
  node: SkillTreeNode,
  prefix: string,
  lines: string[],
) => {
  const entries = Array.from(node.children.entries()).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  entries.forEach(([name, child], index) => {
    const isLast = index === entries.length - 1;
    const branch = isLast ? "└── " : "├── ";
    lines.push(`${prefix}${branch}${name}`);

    if (child.children.size > 0) {
      createTreeLines(child, `${prefix}${isLast ? "    " : "│   "}`, lines);
    }
  });
};

const buildTreeFromFiles = async (
  skill: AgentSkill,
): Promise<string | null> => {
  if (skill.loadTree) {
    return skill.loadTree();
  }

  const root = createSkillTreeNode();
  const readme = await resolveReadme(skill);

  if (readme) {
    root.children.set("SKILL.md", {
      ...createSkillTreeNode(),
      isFile: true,
    });
  }

  for (const file of skill.files ?? []) {
    const normalizedPath = normalizeRelativePath(file.path);
    if (!normalizedPath) {
      continue;
    }

    const parts = normalizedPath.split("/").filter(Boolean);
    let current = root;

    parts.forEach((part, index) => {
      const isLeaf = index === parts.length - 1;
      const existing = current.children.get(part) ?? createSkillTreeNode();
      if (isLeaf && !file.isDirectory) {
        existing.isFile = true;
      }
      current.children.set(part, existing);
      current = existing;
    });
  }

  if (root.children.size === 0) {
    return null;
  }

  const lines = [`${skill.folderName}/`];
  createTreeLines(root, "", lines);
  return lines.join("\n");
};

const readSkillFileContent = async (
  skill: AgentSkill,
  relativePath: string,
): Promise<string | null> => {
  const normalizedPath = normalizeRelativePath(relativePath);
  if (!normalizedPath) {
    return null;
  }

  if (SKILL_README_PATHS.has(relativePath) || normalizedPath === "SKILL.md") {
    return resolveReadme(skill);
  }

  const inlineFile = skill.files?.find(
    (file) =>
      !file.isDirectory &&
      normalizeRelativePath(file.path) === normalizedPath &&
      typeof file.content === "string",
  );
  if (inlineFile?.content) {
    return inlineFile.content;
  }

  if (skill.readFile) {
    return skill.readFile(normalizedPath);
  }

  return null;
};

export const createBuiltinSkillTools = (skills: AgentSkill[]): AgentTool[] => {
  const skillsByFolderName = new Map<string, AgentSkill>();
  skills.forEach((skill) => {
    if (!skillsByFolderName.has(skill.folderName)) {
      skillsByFolderName.set(skill.folderName, skill);
    }
  });

  return [
    {
      name: "list_skills",
      description:
        "获取当前 Agent 可用的 Skills 列表。返回每个 Skill 的标识、文件夹名、名称和描述。",
      source: "agent:skills",
      parameters: {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false,
      },
      execute: async () =>
        formatSuccess({
          count: skillsByFolderName.size,
          skills: Array.from(skillsByFolderName.values()).map((skill) => ({
            id: skill.id,
            folderName: skill.folderName,
            name: skill.name,
            description: skill.description,
            path: skill.path,
          })),
        }),
    },
    {
      name: "get_skill_readme",
      description:
        "获取指定 Skill 的 SKILL.md 内容，用于读取该 Skill 的详细说明和执行方法。",
      source: "agent:skills",
      parameters: {
        type: "object",
        properties: {
          folderName: {
            type: "string",
            description: "Skill 的文件夹名称，可通过 list_skills 获取",
          },
        },
        required: ["folderName"],
        additionalProperties: false,
      },
      execute: async (args) => {
        const folderName = String(args.folderName ?? "").trim();
        if (!folderName) {
          return formatError("必须提供 folderName");
        }

        const result = ensureSkill(skillsByFolderName, folderName);
        if ("error" in result) {
          return result.error;
        }

        try {
          const content = await resolveReadme(result.skill);
          if (!content) {
            return formatError("当前 Skill 未提供 SKILL.md 内容");
          }

          return formatSuccess({
            id: result.skill.id,
            folderName: result.skill.folderName,
            skillName: result.skill.name,
            content,
          });
        } catch (error) {
          return formatError(`获取 SKILL.md 失败: ${(error as Error).message}`);
        }
      },
    },
    {
      name: "get_skill_tree",
      description:
        "展示指定 Skill 的文件树结构，帮助模型了解 Skill 的目录组织与附带资源。",
      source: "agent:skills",
      parameters: {
        type: "object",
        properties: {
          folderName: {
            type: "string",
            description: "Skill 的文件夹名称，可通过 list_skills 获取",
          },
        },
        required: ["folderName"],
        additionalProperties: false,
      },
      execute: async (args) => {
        const folderName = String(args.folderName ?? "").trim();
        if (!folderName) {
          return formatError("必须提供 folderName");
        }

        const result = ensureSkill(skillsByFolderName, folderName);
        if ("error" in result) {
          return result.error;
        }

        try {
          const tree = await buildTreeFromFiles(result.skill);
          if (!tree) {
            return formatError("当前 Skill 未提供可展示的文件结构");
          }
          return {
            content: tree,
          };
        } catch (error) {
          return formatError(
            `获取 Skill 树形结构失败: ${(error as Error).message}`,
          );
        }
      },
    },
    {
      name: "read_skill_file",
      description:
        "读取指定 Skill 目录下的文件内容。对于 SKILL.md，会直接返回该 Skill 的说明文档内容。",
      source: "agent:skills",
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
              "相对于 Skill 根目录的文件路径，例如 templates/example.md",
          },
        },
        required: ["folderName", "relativePath"],
        additionalProperties: false,
      },
      execute: async (args) => {
        const folderName = String(args.folderName ?? "").trim();
        const relativePath = String(args.relativePath ?? "").trim();

        if (!folderName || !relativePath) {
          return formatError("必须提供 folderName 和 relativePath");
        }

        const result = ensureSkill(skillsByFolderName, folderName);
        if ("error" in result) {
          return result.error;
        }

        try {
          const content = await readSkillFileContent(
            result.skill,
            relativePath,
          );
          if (content == null) {
            return formatError("未找到指定文件或当前 Skill 不支持读取该文件");
          }

          return formatSuccess({
            id: result.skill.id,
            folderName: result.skill.folderName,
            relativePath: normalizeRelativePath(relativePath),
            content,
          });
        } catch (error) {
          return formatError(`读取文件失败: ${(error as Error).message}`);
        }
      },
    },
  ];
};
