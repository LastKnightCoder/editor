import type { Skill, ToolDefinition, ToolParameterSchema } from "@/types";
import {
  cancelSkillScript,
  getSkillReadme,
  getSkillTree,
  readSkillFile,
  runSkillScript,
} from "@/commands/skill";
import useSkillStore, { dedupeSkills, isSkillEnabled } from "@/stores/useSkillStore";
import type { MCPProviderDefinition } from "./types";

const ok = (payload: Record<string, unknown>) => ({
  content: JSON.stringify({ success: true, ...payload }, null, 2),
});
const fail = (error: string) => ({
  content: JSON.stringify({ success: false, error }, null, 2),
});

/** 可用 Skill：内置 + 我的 + 关联目录，同名去重、去掉停用的 */
async function getEnabledSkills(): Promise<Skill[]> {
  const store = useSkillStore.getState();
  if (!store.loaded) await store.loadSkills();
  const { skills, preferences } = useSkillStore.getState();
  return dedupeSkills(skills).filter(skill => isSkillEnabled(skill, preferences));
}

async function findSkill(folderName: unknown): Promise<Skill | string> {
  const name = typeof folderName === "string" ? folderName.trim() : "";
  if (!name) return "必须提供 folderName";
  const skill = (await getEnabledSkills()).find(s => s.folderName === name);
  return skill ?? `未找到可用的 Skill「${name}」（可能不存在或已停用）`;
}

const FOLDER_PARAM: ToolParameterSchema = {
  type: "string",
  description: "Skill 的文件夹名称，可通过 list_skills 获取",
};

const normalizeRelative = (p: string) => p.replace(/\\/g, "/").replace(/^\.?\//, "");

export const RUN_SKILL_SCRIPT_TOOL_NAME = "run_skill_script";

const runSkillScriptTool: ToolDefinition = {
  name: RUN_SKILL_SCRIPT_TOOL_NAME,
  description:
    "执行某个 Skill 目录里附带的脚本（如 scripts/xxx.py），返回退出码与标准输出 / 错误。" +
    "按扩展名选解释器：.py 用 python3、.js/.mjs/.cjs 用 Node、.sh 用 bash，其它需有可执行权限。" +
    "工作目录为该 Skill 目录。只在 SKILL.md 说明需要执行脚本时使用；执行前可能需要用户确认。",
  risk: "execute",
  // 等待确认不计时；脚本本身在主进程有 120s 超时
  execution: { timeoutMs: 150_000 },
  parameters: {
    type: "object",
    properties: {
      folderName: FOLDER_PARAM,
      script: { type: "string", description: "相对 Skill 目录的脚本路径，如 scripts/extract.py" },
      args: {
        type: "array",
        items: { type: "string" },
        description: "传给脚本的命令行参数",
      },
      stdin: { type: "string", description: "可选，写入脚本标准输入的文本" },
    },
    required: ["folderName", "script"],
    additionalProperties: false,
  },
  executor: async (args, context) => {
    const skill = await findSkill(args.folderName);
    if (typeof skill === "string") return fail(skill);
    if (skill.isInternal) return fail("内置 Skill 不包含脚本");
    const script = normalizeRelative(String(args.script ?? ""));
    if (!script) return fail("必须提供 script");
    const runId = context?.toolCallId;
    const onAbort = () => {
      if (runId) void cancelSkillScript(runId);
    };
    context?.signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const result = await runSkillScript(
        {
          skillPath: skill.path,
          script,
          args: Array.isArray(args.args) ? args.args.map(String) : [],
          stdin: typeof args.stdin === "string" ? args.stdin : undefined,
        },
        runId
      );
      const payload = {
        folderName: skill.folderName,
        script,
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        truncated: result.truncated,
        durationMs: result.durationMs,
        stdout: result.stdout,
        stderr: result.stderr,
      };
      if (result.cancelled) return { ...fail("脚本已被取消"), isCancelled: true };
      return result.exitCode === 0 && !result.timedOut
        ? ok(payload)
        : {
            content: JSON.stringify(
              {
                success: false,
                error: result.timedOut ? "脚本执行超时" : "脚本退出码非 0",
                ...payload,
              },
              null,
              2
            ),
          };
    } catch (error) {
      return fail((error as Error).message);
    } finally {
      context?.signal?.removeEventListener("abort", onAbort);
    }
  },
};

export const skillToolsProvider: MCPProviderDefinition = {
  id: "skill-tools",
  name: "Skill 工具",
  description:
    "提供 Skill 列表查询、SKILL.md 读取与脚本执行。Skills 是预定义的知识和流程，教会模型如何完成特定任务。",
  defaultEnabled: true,
  tools: (): ToolDefinition[] => [
    {
      name: "list_skills",
      risk: "read",
      description:
        "获取所有可用的 Skills 列表。返回每个 Skill 的文件夹名、名称与描述，再用 get_skill_readme 获取详细说明。",
      parameters: {
        type: "object",
        properties: {} as Record<string, ToolParameterSchema>,
        required: [],
        additionalProperties: false,
      },
      executor: async () => {
        const skills = await getEnabledSkills();
        return ok({
          count: skills.length,
          skills: skills.map(skill => ({
            folderName: skill.folderName,
            name: skill.name,
            description: skill.description,
            source: skill.source,
            hasScripts: Boolean(skill.hasScripts),
          })),
        });
      },
    },
    {
      name: "get_skill_readme",
      risk: "read",
      description: "获取指定 Skill 的 SKILL.md 内容（详细说明、使用方法和相关知识）。",
      parameters: {
        type: "object",
        properties: { folderName: FOLDER_PARAM },
        required: ["folderName"],
        additionalProperties: false,
      },
      executor: async args => {
        const skill = await findSkill(args.folderName);
        if (typeof skill === "string") return fail(skill);
        try {
          const content = skill.readmeContent ?? (await getSkillReadme(skill.path));
          if (!content) return fail("该 Skill 没有 SKILL.md");
          return ok({ folderName: skill.folderName, skillName: skill.name, content });
        } catch (error) {
          return fail(`获取 SKILL.md 失败: ${(error as Error).message}`);
        }
      },
    },
    {
      name: "get_skill_tree",
      risk: "read",
      description: "以树形结构展示指定 Skill 目录下的文件，了解附带的参考资料、模板与脚本。",
      parameters: {
        type: "object",
        properties: { folderName: FOLDER_PARAM },
        required: ["folderName"],
        additionalProperties: false,
      },
      executor: async args => {
        const skill = await findSkill(args.folderName);
        if (typeof skill === "string") return fail(skill);
        if (skill.isInternal) return ok({ tree: `${skill.folderName}/ [内置]\n└── SKILL.md` });
        try {
          return ok({ tree: await getSkillTree(skill.path) });
        } catch (error) {
          return fail(`获取文件树失败: ${(error as Error).message}`);
        }
      },
    },
    {
      name: "read_skill_file",
      risk: "read",
      description:
        "通过相对路径读取指定 Skill 目录下的文件内容，例如 folderName='my-skill'、relativePath='templates/example.md'。",
      parameters: {
        type: "object",
        properties: {
          folderName: FOLDER_PARAM,
          relativePath: { type: "string", description: "相对于 Skill 目录的文件路径" },
        },
        required: ["folderName", "relativePath"],
        additionalProperties: false,
      },
      executor: async args => {
        const skill = await findSkill(args.folderName);
        if (typeof skill === "string") return fail(skill);
        const relativePath = normalizeRelative(String(args.relativePath ?? ""));
        if (!relativePath || relativePath.split("/").includes("..")) {
          return fail("relativePath 必须是 Skill 目录内的相对路径");
        }
        try {
          if (skill.isInternal) {
            if (relativePath !== "SKILL.md") return fail("内置 Skill 只包含 SKILL.md");
            return ok({ folderName: skill.folderName, relativePath, content: skill.readmeContent });
          }
          const content = await readSkillFile(`${skill.path}/${relativePath}`);
          return ok({ folderName: skill.folderName, relativePath, content });
        } catch (error) {
          return fail(`读取文件失败: ${(error as Error).message}`);
        }
      },
    },
    runSkillScriptTool,
  ],
};
