import policy from "../query-database-migration.json";

type ObjectValue = Record<string, unknown>;
export interface LegacyQueryColumn {
  id: string;
  title?: string;
  width?: number;
  hidden?: boolean;
  type?: string;
}
export interface LegacyQueryInput {
  kind: string;
  scope: ObjectValue;
  fields: string[];
  columns: LegacyQueryColumn[];
}
const object = (value: unknown): value is ObjectValue =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export function migrateQueryDefinition(input: LegacyQueryInput) {
  if (!Object.hasOwn(policy, input.kind)) throw new Error("旧关联表的数据源无效");
  const spec = policy[input.kind as keyof typeof policy];
  const selected = spec.fields.filter(([key], index) => index === 0 || input.fields.includes(key));
  const columnMap = new Map<string, string>();
  const selections = selected.map(([oldKey, key, fallback]) => {
    columnMap.set(`src:${oldKey}`, `q:${key}`);
    const title = input.columns.find(column => column.id === `src:${oldKey}`)?.title || fallback;
    return `${key} AS ${JSON.stringify(title)}`;
  });
  selections.push('source AS "来源"');
  const params: Record<string, number | boolean> = {};
  let where = "";
  if (input.kind === "card" || input.kind === "article") {
    const tags = Array.isArray(input.scope.tags)
      ? input.scope.tags.filter((tag): tag is string => typeof tag === "string" && tag.length > 0)
      : [];
    if (tags.length) where = tags.map(tag => `hasTag(${JSON.stringify(tag)})`).join(" OR ");
  } else if (input.kind === "document") {
    const id = input.scope.projectId;
    if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0)
      throw new Error("旧关联表的项目编号无效");
    params.projectId = id;
    params.deep = Boolean(input.scope.deep);
    where = 'kind = "document"';
  } else if (input.scope.range !== "all") {
    where = "year(date) = year(today())";
    if (input.scope.range !== "year") where += " AND month(date) = month(today())";
  }
  const definition = {
    version: 1 as const,
    language: "dsl" as const,
    code: `TABLE ${selections.join(", ")}\nFROM ${spec.source}${where ? `\nWHERE ${where}` : ""}`,
    ...(Object.keys(params).length ? { params } : {}),
  };
  return { definition, columnMap };
}

const fieldKeys = new Set([
  "fieldId",
  "columnId",
  "dateColumnId",
  "groupColumnId",
  "doneColumnId",
  "coverImageColumnId",
]);
const fieldLists = new Set(["hiddenColumnIds", "visibleFieldIds"]);

export function migrateQueryView(
  config: ObjectValue,
  columnMap: ReadonlyMap<string, string>,
  columns: readonly LegacyQueryColumn[]
): ObjectValue {
  const visit = (value: unknown, depth = 0): unknown => {
    if (depth > 64) throw new Error("旧关联表的视图层级过深");
    if (Array.isArray(value))
      return value.map(item => visit(item, depth + 1)).filter(item => item !== undefined);
    if (!object(value)) return value;
    if (
      [...fieldKeys].some(
        key => typeof value[key] === "string" && !columnMap.has(value[key] as string)
      )
    )
      return undefined;
    const result: ObjectValue = Object.create(null);
    for (const [key, child] of Object.entries(value)) {
      if (key === "value") result[key] = structuredClone(child);
      else if (fieldKeys.has(key) && typeof child === "string") result[key] = columnMap.get(child);
      else if (fieldLists.has(key) && Array.isArray(child))
        result[key] = child.flatMap(id =>
          typeof id === "string" && columnMap.has(id) ? [columnMap.get(id)] : []
        );
      else if ((key === "footer" || key === "columnWidths") && object(child)) {
        result[key] = Object.fromEntries(
          Object.entries(child).flatMap(([id, item]) => {
            const next = visit(item, depth + 1);
            return columnMap.has(id) && next !== undefined ? [[columnMap.get(id), next]] : [];
          })
        );
      } else {
        const next = visit(child, depth + 1);
        if (next !== undefined) result[key] = next;
        else if (["expr", "left", "right", "test", "then", "else", "operand"].includes(key))
          return undefined;
      }
    }
    if (result.type === "group" && Array.isArray(result.children) && !result.children.length)
      return undefined;
    return result;
  };
  const migrated = visit(config);
  const result: ObjectValue = object(migrated) ? migrated : {};
  const order = Array.isArray(config.columnOrder) ? config.columnOrder : [];
  result.columnOrder = [
    ...new Set([
      ...order.flatMap(id =>
        typeof id === "string" && columnMap.has(id) ? [columnMap.get(id)] : []
      ),
      ...columnMap.values(),
      "q:source",
    ]),
  ];
  const widths: ObjectValue = {};
  for (const column of columns) {
    const id = columnMap.get(column.id);
    if (id && typeof column.width === "number" && Number.isFinite(column.width))
      widths[id] = column.width;
  }
  result.columnWidths = { ...widths, ...(object(result.columnWidths) ? result.columnWidths : {}) };
  result.hiddenColumnIds = [
    ...new Set([
      ...(Array.isArray(result.hiddenColumnIds) ? result.hiddenColumnIds : []),
      ...columns.flatMap(column =>
        column.hidden && columnMap.has(column.id) ? [columnMap.get(column.id)] : []
      ),
    ]),
  ];
  result.filters ??= null;
  result.groupBy ??= null;
  result.sorts ??= [];
  result.rowOrder ??= [];
  return result;
}

export function migrateQueryViewType(type: string, config: ObjectValue): string {
  const options = object(config.viewOptions) ? config.viewOptions[type] : undefined;
  const key =
    type === "calendar" ? "dateColumnId" : type === "kanban" ? "groupColumnId" : undefined;
  return key && (!object(options) || typeof options[key] !== "string") ? "table" : type;
}
