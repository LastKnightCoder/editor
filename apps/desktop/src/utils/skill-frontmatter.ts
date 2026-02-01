import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

// 解析 SKILL.md 的 front-matter，只提取 description
// name 不在 front-matter 中存储，从文件夹名称获取
export function parseSkillFrontMatter(content: string): {
  description: string;
  body: string;
} {
  const frontMatterMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);

  if (frontMatterMatch) {
    try {
      const yamlContent = frontMatterMatch[1];
      const body = frontMatterMatch[2] || "";
      const parsed = parseYaml(yamlContent) as { description?: string };

      return {
        description: parsed.description || "",
        body,
      };
    } catch (error) {
      console.warn("Failed to parse front-matter:", error);
    }
  }

  // 没有 front-matter，从内容中提取
  return {
    description: extractDescriptionFromBody(content),
    body: content,
  };
}

// 序列化 description 为 YAML front-matter 格式
export function serializeSkillFrontMatter(
  description: string,
  body: string,
): string {
  // 如果没有描述，只保留空的 front-matter 结构
  const cleanMeta: Record<string, unknown> = {};

  if (description) {
    cleanMeta.description = description;
  }

  const yamlContent = stringifyYaml(cleanMeta, {
    lineWidth: 0, // 不自动换行
    defaultKeyType: "PLAIN",
    defaultStringType: "QUOTE_DOUBLE",
  }).trim();

  // 确保 body 以换行开头
  const normalizedBody = body.startsWith("\n") ? body : `\n${body}`;

  // 即使没有元信息，也保留 front-matter 结构
  if (!yamlContent || yamlContent === "{}") {
    return `---\n---${normalizedBody}`;
  }

  return `---\n${yamlContent}\n---${normalizedBody}`;
}

// 从内容中提取描述
function extractDescriptionFromBody(content: string): string {
  const lines = content.split("\n");
  let foundTitle = false;

  for (const line of lines) {
    if (!foundTitle) {
      if (line.match(/^#\s+/)) {
        foundTitle = true;
      }
      continue;
    }

    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith("#")) continue;

    return trimmedLine;
  }

  return "";
}
