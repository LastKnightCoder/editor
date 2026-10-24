import { assertLocalId } from "./ids.ts";

/**
 * 包内 Skill：`skills/<id>/` 是一份标准 Agent Skills 目录（SKILL.md + 附件 + scripts/），
 * manifest 的 `skills` 列出目录 ID，目录内全部文件进入 integrity。名称、描述与调用方式
 * 取自 SKILL.md 的 front matter，manifest 不重复声明。
 */
export const SKILL_ROOT = "skills";
export const SKILL_README = "SKILL.md";

/** 能被 Skill 脚本工具直接执行的文件；与桌面脚本运行器的解释器映射一致。 */
const SCRIPT_EXTENSION = /\.(?:js|mjs|cjs|ts|py|sh)$/i;

export const skillDirectory = (id: string) => `${SKILL_ROOT}/${id}`;

/** 读取 manifest.skills；缺省返回 undefined，空数组视为未声明。 */
export function readSkillsField(value: unknown): readonly string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error("skills 必须是数组");
  const ids = new Set<string>();
  for (const id of value) {
    if (typeof id !== "string") throw new Error("Skill ID 无效");
    assertLocalId(id);
    ids.add(id);
  }
  return ids.size ? Object.freeze([...ids]) : undefined;
}

/** 校验 integrity 中的 Skill 文件：都落在已声明目录内，且每个目录都有 SKILL.md。 */
export function readSkillFiles(
  skills: readonly string[] | undefined,
  integrity: Record<string, unknown>
): Record<string, string> {
  const files: Record<string, string> = {};
  const declared = new Set(skills ?? []);
  for (const [name, hash] of Object.entries(integrity)) {
    if (!name.startsWith(SKILL_ROOT + "/")) continue;
    const [, id, ...rest] = name.split("/");
    if (
      !declared.has(id) ||
      !rest.length ||
      rest.some(part => !part || part === "." || part === "..")
    )
      throw new Error(`Skill 文件不属于已声明的 Skill：${name}`);
    if (typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash))
      throw new Error("Skill 文件缺少有效的完整性摘要");
    files[name] = hash;
  }
  for (const id of declared)
    if (!files[`${skillDirectory(id)}/${SKILL_README}`])
      throw new Error(`Skill ${id} 缺少 ${SKILL_README}`);
  return files;
}

/** 包内 Skill 是否带可执行脚本；带脚本的版本与本机后台一样需要人工审核。 */
export function hasSkillScripts(manifest: {
  skills?: readonly string[];
  integrity: Record<string, string>;
}): boolean {
  if (!manifest.skills?.length) return false;
  return Object.keys(manifest.integrity).some(
    name =>
      name.startsWith(SKILL_ROOT + "/") &&
      (name.split("/")[2] === "scripts" || SCRIPT_EXTENSION.test(name))
  );
}
