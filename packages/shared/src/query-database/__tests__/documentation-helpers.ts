import { QUERY_SOURCES, isQuerySource } from "../catalog";
import { collectQueryData, executeQuery, parseQuery } from "../dsl";
import { validateQueryResult } from "../result";
import type { QueryContext, QueryReader, QueryRecord, QuerySource, QueryValue } from "../types";

const context: QueryContext = {
  now: Date.parse("2026-11-26T09:00:00+08:00"),
  today: "2026-11-26",
  timeZone: "Asia/Shanghai",
  params: { tag: "读书", minWords: 500, tableId: 7, start: "2026-11-01", end: "2026-12-01" },
};
const common = {
  title: "读书笔记",
  createdAt: context.now,
  updatedAt: context.now,
  tags: ["读书/编程"],
  wordCount: 1000,
  pinned: false,
  source: { kind: "card", id: "1", title: "读书笔记" },
  contentRef: { contentId: 10, createdAt: 1 },
};
const records: Partial<Record<QuerySource, QueryRecord[]>> = {
  cards: [{ ...common, id: "card:1" }],
  articles: [{ ...common, id: "article:1", author: "作者" }],
  diary: [
    {
      id: "diary:1",
      title: context.today,
      date: context.today,
      weather: "晴",
      mood: "愉快",
      tags: [],
      wordCount: 200,
      source: { kind: "diary", id: "1", title: context.today },
    },
  ],
  projects: [
    {
      id: "project:42",
      title: "阅读项目",
      createdAt: context.now,
      updatedAt: context.now,
      archived: false,
      pinned: false,
      documentCount: 1,
      source: { kind: "project", id: "42", title: "阅读项目" },
    },
  ],
  documents: [{ ...common, id: "document:1", kind: "document", parent: "", projectIds: [42] }],
  calendar: [
    {
      id: "1:1",
      title: "读书会",
      start: context.now,
      end: context.now + 3600000,
      allDay: false,
      calendarId: "1",
      kind: "event",
      source: { kind: "event", id: "1", title: "读书会" },
    },
  ],
  tables: [{ id: "r1", score: 90, memo: "阅读记录" }],
  contents: [{ id: "10:1", markdown: "# 阅读记录", nodes: [], wordCount: 4 }],
};
function reader(empty: boolean): QueryReader {
  return async request => {
    const rows = empty ? [] : (records[request.source] ?? []);
    const tag = request.options?.tag;
    const items = rows
      .filter(
        row =>
          typeof tag !== "string" ||
          (Array.isArray(row.tags) &&
            row.tags.some(
              value => typeof value === "string" && (value === tag || value.startsWith(tag + "/"))
            ))
      )
      .map(
        row =>
          new Proxy(structuredClone(row), {
            get(target, key, receiver) {
              if (
                typeof key === "string" &&
                !Object.hasOwn(target, key) &&
                !["then", "toJSON"].includes(key)
              )
                throw new Error(`示例读取了 ${request.source} 的未知字段 ${key}`);
              return Reflect.get(target, key, receiver);
            },
          })
      );
    return {
      items,
      ...(request.source === "tables"
        ? {
            fields: [
              { key: "id", title: "编号", type: "text" as const },
              { key: "score", title: "评分", type: "number" as const },
              { key: "memo", title: "备注", type: "text" as const },
            ],
          }
        : {}),
    };
  };
}

export async function verifyQueryExamples(markdown: string): Promise<string[]> {
  const blocks = [
    ...markdown.matchAll(/^```(sql|js|tau-query|tau-queryjs)\s*\n([\s\S]*?)^```/gm),
  ].map((match, index) => ({ language: match[1], code: match[2], index }));

  if (!blocks.length) throw new Error("查询参考没有扫描到可执行示例");
  const errors: string[] = [];
  for (const empty of [false, true]) {
    const read = reader(empty);
    const data = Object.fromEntries(
      Object.keys(QUERY_SOURCES).map(source => {
        if (!isQuerySource(source)) throw new Error("来源无效");
        return [
          source,
          {
            collect: async (options: Record<string, QueryValue> = {}) =>
              (await collectQueryData(read, source, options)).items,
          },
        ];
      })
    );
    for (const block of blocks) {
      try {
        if (block.language === "sql" || block.language === "tau-query")
          validateQueryResult(await executeQuery(parseQuery(block.code), read, context));
        else {
          const AsyncFunction = Object.getPrototypeOf(async () => undefined).constructor;
          validateQueryResult(
            await new AsyncFunction("data", "ctx", '"use strict";\n' + block.code)(data, context)
          );
        }
      } catch (error) {
        errors.push(`${block.language} 示例 ${block.index + 1}，空数据=${empty}: ${String(error)}`);
      }
    }
  }
  return errors;
}
