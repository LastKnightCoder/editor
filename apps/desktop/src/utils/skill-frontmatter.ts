import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

/**
 * SKILL.md front-matter 读写（编辑页「编辑」视图用）：表单只改 name / title / description /
 * disable-model-invocation，其余字段（allowed-tools、license、metadata……）原样保留。
 */

export interface SkillDocument {
  meta: Record<string, unknown>;
  body: string;
  /** YAML 写坏了：编辑视图不可用，只能改源码 */
  error?: string;
}

const FRONT_MATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export function splitSkillDocument(content: string): SkillDocument {
  const match = content.match(FRONT_MATTER_RE);
  if (!match) return { meta: {}, body: content };
  try {
    const parsed = parseYaml(match[1]);
    const meta = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    return { meta: meta as Record<string, unknown>, body: match[2] ?? "" };
  } catch (error) {
    return { meta: {}, body: match[2] ?? "", error: (error as Error).message };
  }
}

export function joinSkillDocument(meta: Record<string, unknown>, body: string): string {
  const clean = Object.fromEntries(
    Object.entries(meta).filter(
      ([, value]) => value !== undefined && value !== "" && value !== false
    )
  );
  const yaml = Object.keys(clean).length
    ? stringifyYaml(clean, {
        lineWidth: 0,
        defaultStringType: "QUOTE_DOUBLE",
        defaultKeyType: "PLAIN",
      }).trim()
    : "";
  const normalizedBody = body.replace(/^\n+/, "");
  return `---\n${yaml ? `${yaml}\n` : ""}---\n\n${normalizedBody}`;
}

export const metaString = (meta: Record<string, unknown>, key: string): string =>
  typeof meta[key] === "string" ? (meta[key] as string) : "";

/** 描述写没写「什么时候用」：粗判是否出现触发场景的措辞 */
export const hasTriggerHint = (description: string): boolean =>
  /(时使用|时用|当用户|用户提到|用户要求|when |use when|use this|触发)/i.test(description);

/** 粗估 tokens：中文按字、其余按 4 字符 */
export const estimateTokens = (text: string): number => {
  const cjk = (text.match(/[\u3000-\u9fff\uff00-\uffef]/g) ?? []).length;
  return Math.ceil(cjk + (text.length - cjk) / 4);
};
