import {
  parseQuery,
  QUERY_SOURCES,
  type QueryDefinition,
  type QuerySource,
} from "@tau/shared/query-database";

export interface QuerySummary {
  source?: QuerySource;
  sourceTitle?: string;
  /** DSL 里引用到的 params.xxx，按出现顺序 */
  paramNames: string[];
  /** 语法错误；JavaScript 不做静态检查 */
  syntaxError?: string;
}

const PARAM_PATTERN = /params\.([A-Za-z_][\w]*)/g;

/** 从查询源码读出来源与参数引用，供状态行、参数胶囊与空态文案使用；不执行查询 */
export function summarizeQuery(definition: QueryDefinition): QuerySummary {
  const paramNames = [...new Set(Array.from(definition.code.matchAll(PARAM_PATTERN), m => m[1]))];
  if (!definition.code.trim()) return { paramNames };
  if (definition.language === "javascript") {
    const source = definition.code.match(/data\.(\w+)\.collect/)?.[1];
    return source && Object.hasOwn(QUERY_SOURCES, source)
      ? {
          source: source as QuerySource,
          sourceTitle: QUERY_SOURCES[source as QuerySource].title,
          paramNames,
        }
      : { paramNames };
  }
  try {
    const plan = parseQuery(definition.code);
    return {
      source: plan.source,
      sourceTitle: QUERY_SOURCES[plan.source].title,
      paramNames,
    };
  } catch (error) {
    return {
      paramNames,
      syntaxError: error instanceof Error ? error.message : String(error),
    };
  }
}

/** 「第 N 字符」换算成行列，供问题条定位 */
export function locateQueryError(code: string, message: string) {
  const offset = Number(message.match(/第 (\d+) 字符/)?.[1]);
  if (!Number.isFinite(offset) || offset < 1) return undefined;
  const before = code.slice(0, offset - 1).split("\n");
  return { line: before.length, column: before[before.length - 1].length + 1 };
}

const PREFERRED_COLUMNS = [
  "tags",
  "completed",
  "dueAt",
  "start",
  "end",
  "date",
  "wordCount",
  "projectIds",
  "updatedAt",
];

/** 新建时选来源生成的起步查询：来源链接 + 来源目录里的前几个展示字段 */
export function starterQuery(source: QuerySource): QueryDefinition {
  if (source === "tables")
    return {
      version: 1,
      language: "dsl",
      code: "TABLE id\nFROM tables",
      params: { tableId: null },
    };
  const { title, fields: catalog } = QUERY_SOURCES[source];
  const fields = catalog.filter(field => field.type !== "json" && field.key !== "id");
  const primary = fields.find(field => field.type === "entity") ?? fields[0];
  const rank = (key: string) => {
    const index = PREFERRED_COLUMNS.indexOf(key);
    return index < 0 ? PREFERRED_COLUMNS.length : index;
  };
  const rest = fields
    .filter(field => field !== primary && field.type !== "entity" && field.key !== "title")
    .sort((a, b) => rank(a.key) - rank(b.key))
    .slice(0, 3);
  const columns = [
    `${primary.key} AS "${primary.type === "entity" ? title : primary.title}"`,
    ...rest.map(field => `${field.key} AS "${field.title}"`),
  ].join(", ");
  const sort = fields.find(field => ["updatedAt", "date", "start", "dueAt"].includes(field.key));
  return {
    version: 1,
    language: "dsl",
    code: `TABLE ${columns}\nFROM ${source}${sort ? `\nSORT ${sort.key} DESC` : ""}`,
    // 日程默认按展示区间读取，起步查询直接读真实日程记录
    ...(source === "calendar" ? { params: { view: "stored" } } : {}),
  };
}
