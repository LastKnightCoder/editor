// Skill 元信息（存储在 SKILL.md 的 front-matter 中）
export interface SkillMeta {
  name: string;
  description: string;
}

/** 来源：我的（应用 skills 目录，可写）/ 内置（代码预定义，只读）/ 关联目录（其它工具的 skills 目录，只读） */
export type SkillSource = "mine" | "builtin" | "linked";

/** 调用方式：自动 = 描述进系统提示词、AI 自行加载；仅手动 = 只在用户 `$` 点名时加载 */
export type SkillInvocation = "auto" | "manual";

export interface Skill extends SkillMeta {
  folderName: string;
  /** Skill 根目录绝对路径；内置为 internal://<folderName> */
  path: string;
  source?: SkillSource;
  /** 关联目录来源的根目录（绝对路径） */
  rootPath?: string;
  isInternal?: boolean; // 是否为内部 skill
  readmeContent?: string; // 内部 skill 的 SKILL.md 内容
  /** front-matter `disable-model-invocation: true` → 默认仅手动 */
  defaultInvocation?: SkillInvocation;
  allowedTools?: string[];
  fileCount?: number;
  hasScripts?: boolean;
  updatedAt?: number;
}

// 内部 Skill 类型（代码中预定义的 skill）
export interface InternalSkill {
  folderName: string; // 唯一标识
  name: string;
  description: string;
  readmeContent: string; // SKILL.md 的完整内容
  isInternal: true;
}

export interface SkillFile {
  name: string;
  path: string;
  /** 相对 Skill 根目录的路径（posix 分隔） */
  relativePath?: string;
  isDirectory: boolean;
  isMarkdown: boolean;
}

export interface SkillDetail extends Skill {
  readmeContent: string;
  files: SkillFile[];
}

export interface SkillLinkedDir {
  path: string;
  enabled: boolean;
  /** 预置目录的显示名（Claude Code / Codex / 通用 Agent Skills）；自定义目录为空 */
  label?: string;
  preset?: boolean;
  exists?: boolean;
  count?: number;
  /** 已启用的 skill 数（从未选择过时等于 count） */
  selectedCount?: number;
  /** 白名单原始状态：undefined = 从未选择（全部生效）；空数组 = 明确全不选 */
  selectedSkills?: string[];
  /** 目录内的 skill 摘要（目录存在时返回）；selected = 当前是否生效 */
  skills?: Array<{
    folderName: string;
    name: string;
    description?: string;
    selected: boolean;
  }>;
}

export type SkillImportSource =
  | { type: "zip"; path: string }
  | { type: "folder"; path: string }
  | { type: "github"; url: string };

export interface SkillImportCandidate {
  relPath: string;
  folderName: string;
  name: string;
  description: string;
  fileCount: number;
  hasScripts: boolean;
  /** 「我的」里已有同名文件夹 */
  exists?: boolean;
}

export interface SkillImportInspection {
  token: string;
  candidates: SkillImportCandidate[];
}

export interface SkillScriptRunRequest {
  skillPath: string;
  script: string;
  args?: string[];
  stdin?: string;
  timeoutMs?: number;
}

export interface SkillScriptRunResult {
  command: string;
  args: string[];
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  cancelled: boolean;
  truncated: boolean;
  durationMs: number;
}
