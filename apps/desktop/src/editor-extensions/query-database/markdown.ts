import type { Descendant } from "slate";
import type { MarkdownCodec } from "@tau/markdown";
import type { QueryDatabaseElement } from "./types";

function metadata(
  value: string | undefined
): Pick<QueryDatabaseElement, "paramsJson" | "presentationJson"> {
  const encoded = value
    ?.split(/\s+/)
    .find(part => part.startsWith("qdb="))
    ?.slice(4);
  if (!encoded) return {};
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(encoded));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error("无效的查询块配置");
    const config = parsed as Record<string, unknown>;
    return {
      ...(config.params ? { paramsJson: JSON.stringify(config.params) } : {}),
      ...(config.presentation ? { presentationJson: JSON.stringify(config.presentation) } : {}),
    };
  } catch {
    throw new Error("查询块的参数或展示配置无效，请检查 qdb 元数据");
  }
}
export const queryDatabaseCodec: MarkdownCodec = {
  type: "query-database",
  dataVersion: 1,
  isVoid: true,
  fenceSourceProperty: "code",
  importNode: node => {
    if (node.type !== "code" || !["tau-query", "tau-queryjs"].includes(node.lang ?? ""))
      return null;
    return {
      type: "query-database",
      id: crypto.randomUUID(),
      code: node.value ?? "",
      language: node.lang === "tau-queryjs" ? "javascript" : "dsl",
      ...metadata(node.meta),
      children: [{ type: "formatted", text: "" }],
    } as Descendant;
  },
  serializer: {
    isBlock: true,
    toMarkdown: element => {
      const code = String(element.code ?? "");
      const fence = "`".repeat(
        Math.max(3, ...Array.from(code.matchAll(/`+/g), match => match[0].length + 1))
      );
      const config = {
        ...(element.paramsJson ? { params: JSON.parse(String(element.paramsJson)) } : {}),
        ...(element.presentationJson
          ? { presentation: JSON.parse(String(element.presentationJson)) }
          : {}),
      };
      const meta = Object.keys(config).length
        ? " qdb=" + encodeURIComponent(JSON.stringify(config))
        : "";
      return `${fence}${element.language === "javascript" ? "tau-queryjs" : "tau-query"}${meta}\n${code}\n${fence}`;
    },
  },
};
