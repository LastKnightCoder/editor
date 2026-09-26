import { parse as parseYaml } from "yaml";

export interface ParsedSkillFrontMatter {
  name?: string;
  description: string;
  /** Claude Code 同名字段：true = 只能由用户点名加载 */
  disableModelInvocation: boolean;
  allowedTools: string[];
}

const FRONT_MATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/;

/** 没有 front-matter 时，取一级标题后的第一段正文作描述 */
const extractDescriptionFromBody = (content: string): string => {
  const lines = content.replace(FRONT_MATTER_RE, "").split("\n");
  let foundTitle = false;
  for (const line of lines) {
    if (!foundTitle) {
      if (/^#\s+/.test(line)) foundTitle = true;
      continue;
    }
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    return trimmed;
  }
  return "";
};

/** allowed-tools 兼容数组、逗号分隔与空格分隔（`Bash(git *)` 这类带括号的整体保留） */
export const parseAllowedTools = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map(v => String(v).trim()).filter(Boolean);
  }
  if (typeof value !== "string") return [];
  const tokens: string[] = [];
  let current = "";
  let depth = 0;
  for (const ch of value) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if (depth === 0 && (ch === "," || /\s/.test(ch))) {
      if (current.trim()) tokens.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) tokens.push(current.trim());
  return tokens;
};

export const parseSkillFrontMatter = (content: string): ParsedSkillFrontMatter => {
  const match = content.match(FRONT_MATTER_RE);
  if (match) {
    try {
      const meta = (parseYaml(match[1]) ?? {}) as Record<string, unknown>;
      return {
        name: typeof meta.name === "string" && meta.name.trim() ? meta.name.trim() : undefined,
        description:
          typeof meta.description === "string"
            ? meta.description.trim()
            : extractDescriptionFromBody(content),
        disableModelInvocation: meta["disable-model-invocation"] === true,
        allowedTools: parseAllowedTools(meta["allowed-tools"]),
      };
    } catch {
      // YAML 写坏了：退回正文提取
    }
  }
  return {
    description: extractDescriptionFromBody(content),
    disableModelInvocation: false,
    allowedTools: [],
  };
};
