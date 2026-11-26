import { QUERY_SOURCES, isQuerySource } from "./catalog";
import {
  Parser,
  tokenize,
  evaluate,
  inferType,
  hasAggregate,
  dateScalar,
  type Expression,
} from "./expression";
import type {
  QueryColumn,
  QueryColumnType,
  QueryContext,
  QueryReadPage,
  QueryReader,
  QueryRecord,
  QueryResult,
  QuerySource,
  QueryValue,
} from "./types";
import { QUERY_LIMITS } from "./types";
import { validateQueryResult } from "./result";

interface Selection {
  expression: Expression;
  key: string;
  title?: string;
  type?: QueryColumnType;
}
export interface QueryPlan {
  source: QuerySource;
  select: Selection[];
  where?: Expression;
  groupBy?: Expression;
  sorts: { expression: Expression; descending: boolean }[];
  limit?: number;
}
const TYPES = new Set<QueryColumnType>([
  "text",
  "number",
  "boolean",
  "date",
  "select",
  "multiSelect",
  "entity",
  "json",
]);
export const isQueryColumnType = (type: unknown): type is QueryColumnType =>
  typeof type === "string" && TYPES.has(type as QueryColumnType);

export function parseQuery(code: string): QueryPlan {
  const parser = new Parser(tokenize(code));
  parser.expect("TABLE");
  const select: Selection[] = [];
  do {
    const expression = parser.expression();
    let title: string | undefined;
    let type: QueryColumnType | undefined;
    if (parser.at("AS")) {
      parser.take();
      const token = parser.take();
      title = String(token.value ?? token.text);
    }
    if (parser.at("TYPE")) {
      parser.take();
      const value = parser.take().text;
      if (!isQueryColumnType(value)) throw new Error(`未知列类型：${value}`);
      type = value;
    }
    const key = expression.kind === "field" ? expression.name : title;
    if (!key) throw new Error("计算列需要通过 AS 指定名称");
    if (select.some(column => column.key === key)) throw new Error(`重复的列：${key}`);
    select.push({ expression, key, title, type });
    if (!parser.at(",")) break;
    parser.take();
  } while (true);
  parser.expect("FROM");
  const source = parser.take().text;
  if (!isQuerySource(source)) throw new Error(`未知数据来源：${source}`);
  const plan: QueryPlan = { source, select, sorts: [] };
  if (parser.at("WHERE")) {
    parser.take();
    plan.where = parser.expression();
  }
  if (parser.at("GROUP")) {
    parser.take();
    parser.expect("BY");
    plan.groupBy = parser.expression();
  }
  if (parser.at("SORT")) {
    parser.take();
    do {
      const expression = parser.expression();
      const descending = parser.at("DESC");
      if (descending || parser.at("ASC")) parser.take();
      plan.sorts.push({ expression, descending });
      if (!parser.at(",")) break;
      parser.take();
    } while (true);
  }
  if (parser.at("LIMIT")) {
    parser.take();
    const token = parser.take();
    if (
      !Number.isSafeInteger(token.value) ||
      Number(token.value) < 0 ||
      Number(token.value) > QUERY_LIMITS.resultRows
    )
      throw new Error("LIMIT 需要有效的非负整数");
    plan.limit = Number(token.value);
  }
  if (parser.peek())
    throw new Error(`第 ${parser.peek().offset + 1} 字符：无法识别 ${parser.peek().text}`);
  return plan;
}

export async function collectQueryData(
  reader: QueryReader,
  source: QuerySource,
  options: Record<string, QueryValue> = {}
): Promise<QueryReadPage> {
  const items: QueryRecord[] = [];
  const cursors = new Set<string>();
  let cursor: string | undefined;
  let fields: QueryColumn[] | undefined;
  do {
    const page = await reader({ source, options, ...(cursor ? { cursor } : {}) });
    if (!Array.isArray(page.items)) throw new Error("数据来源返回了无效结果");
    items.push(...page.items);
    fields ??= page.fields;
    if (items.length > QUERY_LIMITS.readRows) throw new Error("读取的数据过多，请缩小查询范围");
    cursor = page.cursor;
    if (cursor) {
      if (cursors.has(cursor)) throw new Error("数据分页无法推进，请重新运行");
      cursors.add(cursor);
    }
  } while (cursor);
  return { items, fields };
}

function readOptions(plan: QueryPlan, context: QueryContext): Record<string, QueryValue> {
  const options = { ...context.params };
  const visit = (expression: Expression) => {
    if (expression.kind === "binary" && ["AND", "&&"].includes(expression.op)) {
      visit(expression.left);
      visit(expression.right);
    }
    if (
      expression.kind === "call" &&
      expression.name === "hastag" &&
      expression.args[0]?.kind === "literal" &&
      typeof expression.args[0].value === "string"
    )
      options.tag = expression.args[0].value;
  };
  if (plan.where) visit(plan.where);
  return options;
}

function groupedExpression(
  expression: Expression,
  groupBy: Expression | undefined,
  aliases = new Set<string>()
): boolean {
  if (JSON.stringify(expression) === JSON.stringify(groupBy)) return true;
  if (expression.kind === "literal") return true;
  if (expression.kind === "field")
    return expression.name.startsWith("params.") || aliases.has(expression.name);
  if (expression.kind === "unary") return groupedExpression(expression.value, groupBy, aliases);
  if (expression.kind === "binary")
    return (
      groupedExpression(expression.left, groupBy, aliases) &&
      groupedExpression(expression.right, groupBy, aliases)
    );
  if (["count", "sum", "avg", "min", "max"].includes(expression.name)) {
    if (expression.args.some(hasAggregate)) throw new Error("聚合函数不能嵌套");
    return true;
  }
  if (expression.name === "field")
    return (
      expression.args[0]?.kind === "literal" &&
      typeof expression.args[0].value === "string" &&
      aliases.has(expression.args[0].value)
    );
  return expression.args.every(arg => groupedExpression(arg, groupBy, aliases));
}

export async function executeQuery(
  plan: QueryPlan,
  reader: QueryReader,
  context: QueryContext
): Promise<QueryResult> {
  const page = await collectQueryData(reader, plan.source, readOptions(plan, context));
  const fields = page.fields ?? QUERY_SOURCES[plan.source].fields;
  const types = new WeakMap<Expression, QueryColumnType | undefined>();
  if ((plan.where && hasAggregate(plan.where)) || (plan.groupBy && hasAggregate(plan.groupBy)))
    throw new Error("WHERE 和 GROUP BY 中不能使用聚合函数");
  if (plan.where) inferType(plan.where, fields, types);
  if (plan.groupBy) inferType(plan.groupBy, fields, types);
  const columns = plan.select.map((selection): QueryColumn => {
    const inferred = inferType(selection.expression, fields, types);
    const type = selection.type ?? inferred;
    if (!type) throw new Error(`无法推导 ${selection.key} 的类型，请使用 TYPE 声明`);
    const original = fields.find(field => field.key === selection.key);
    return {
      key: selection.key,
      title: selection.title ?? original?.title ?? selection.key,
      type,
      ...(original?.options ? { options: original.options } : {}),
    };
  });
  const matching = page.items.filter(
    row => !plan.where || Boolean(evaluate(plan.where, { row, context, types }))
  );
  const aggregate = plan.select.some(selection => hasAggregate(selection.expression));
  if (aggregate || plan.groupBy) {
    for (const selection of plan.select) {
      if (!groupedExpression(selection.expression, plan.groupBy))
        throw new Error(`分组查询中的 ${selection.key} 必须是分组字段或聚合表达式`);
    }
    const aliases = new Set(columns.map(column => column.key));
    for (const sort of plan.sorts)
      if (!groupedExpression(sort.expression, plan.groupBy, aliases))
        throw new Error("分组排序需要使用分组字段、结果列或聚合表达式");
  } else if (plan.sorts.some(sort => hasAggregate(sort.expression))) {
    throw new Error("聚合排序需要分组或聚合查询");
  }
  const groups = new Map<string, QueryRecord[]>();
  if (plan.groupBy)
    for (const row of matching) {
      const key = JSON.stringify(evaluate(plan.groupBy, { row, context, types }));
      const group = groups.get(key) ?? [];
      group.push(row);
      groups.set(key, group);
    }
  else if (aggregate) groups.set("all", matching);
  const inputs =
    plan.groupBy || aggregate
      ? [...groups].map(([key, group]) => ({
          row: group[0] ?? { id: "empty" },
          group,
          id: `group:${key}`,
        }))
      : matching.map(row => ({ row, group: undefined, id: row.id }));
  const output = inputs.map(input => ({
    input,
    values: Object.fromEntries(
      plan.select.map(selection => [
        selection.key,
        evaluate(selection.expression, { ...input, context, types }),
      ])
    ),
  }));
  for (const sort of plan.sorts) inferType(sort.expression, [...columns, ...fields], types);
  output.sort((a, b) => {
    for (const sort of plan.sorts) {
      let left = evaluate(sort.expression, {
        ...a.input,
        row: { ...a.input.row, ...a.values },
        context,
        types,
      });
      let right = evaluate(sort.expression, {
        ...b.input,
        row: { ...b.input.row, ...b.values },
        context,
        types,
      });
      if (types.get(sort.expression) === "date") {
        left = dateScalar(left);
        right = dateScalar(right);
      }
      const order =
        left === right
          ? 0
          : left === null
            ? 1
            : right === null
              ? -1
              : typeof left === "number" && typeof right === "number"
                ? left - right
                : String(left).localeCompare(String(right), "zh-Hans-CN");
      if (order) return sort.descending ? -order : order;
    }
    return a.input.id.localeCompare(b.input.id);
  });
  return validateQueryResult({
    columns,
    rows: output.slice(0, plan.limit).map(({ input, values }) => ({ id: input.id, values })),
  });
}
