export interface KnowledgeMapping {
  projects: Record<string, number>;
  items: Record<string, number>;
}

export const KNOWLEDGE_MIGRATION_KEY = "knowledge-to-project:v1";

export function mappedKnowledgeId(mapping: Record<string, number>, id: unknown): number {
  const result = mapping[String(id)];
  if (!Number.isSafeInteger(result) || result <= 0) {
    throw new Error(`KNOWLEDGE_MIGRATION_FAILED: 无法定位历史引用 ${String(id)}`);
  }
  return result;
}

/** 仅转换实体载荷，不改写普通文字、代码或其他文档协议。 */
export function migrateKnowledgeReferences(value: unknown, mapping: KnowledgeMapping): unknown {
  if (Array.isArray(value)) return value.map(item => migrateKnowledgeReferences(item, mapping));
  if (!value || typeof value !== "object") return value;
  const source = value as Record<string, unknown>;
  const result: Record<string, unknown> = Object.fromEntries(
    Object.entries(source).map(([key, item]) => [key, migrateKnowledgeReferences(item, mapping)])
  );
  if (source.type === "document-card-list") {
    result.type = "project-card-list";
    result.projectItemId = mappedKnowledgeId(mapping.items, source.documentItemId);
    delete result.documentItemId;
  }
  for (const [typeKey, idKey] of [
    ["contentType", "refId"],
    ["sourceType", "sourceId"],
    ["entityType", "entityId"],
    ["refType", "refId"],
    ["type", "id"],
    ["type", "originalId"],
  ]) {
    if (source[typeKey] === "document-item" && source[idKey] !== undefined) {
      result[typeKey] = "project-item";
      result[idKey] = mappedKnowledgeId(mapping.items, source[idKey]);
    }
  }
  return result;
}

/** 聊天引用只在 Markdown 正文中转换，跳过代码围栏和行内代码。 */
export function migrateKnowledgeCitations(text: string, mapping: KnowledgeMapping): string {
  let remaining = text;
  let result = "";
  while (remaining) {
    const code = /^(\`+|~{3,})/.exec(remaining)?.[0];
    if (code) {
      const end = remaining.indexOf(code, code.length);
      const length = end < 0 ? remaining.length : end + code.length;
      result += remaining.slice(0, length);
      remaining = remaining.slice(length);
      continue;
    }
    const citation = /^:ref\[([^\]\n]*)\]\{([^}\n]*)\}/.exec(remaining);
    if (citation) {
      const parts = citation[2].trim().split(/\s+/);
      const id = parts.find(part => /^id=\d+$/.test(part));
      if (id && parts.includes("type=document-item")) {
        const next = parts.map(part =>
          part === id
            ? `id=${mappedKnowledgeId(mapping.items, Number(id.slice(3)))}`
            : part === "type=document-item"
              ? "type=project-item"
              : part
        );
        result += `:ref[${citation[1]}]{${next.join(" ")}}`;
        remaining = remaining.slice(citation[0].length);
        continue;
      }
    }
    result += remaining[0];
    remaining = remaining.slice(1);
  }
  return result;
}
