import { canonicalContractJson } from "@tau/db-schema/content-contracts";
import type { Row, RowChange, SqlValue } from "./protocol";
import type { SyncTable } from "./sql";

export interface MetadataReference {
  column: string;
  table: string;
  when?: { column: string; value: string };
  prefix?: string;
  createdAt?: string;
}

export interface MetadataRule {
  columns?: string[];
  identity?: string[];
  generatedKey?: boolean;
  timestamps?: string[];
  json?: string[];
  references?: MetadataReference[];
  opaque?: string[];
}

export interface RowAlias {
  table: string;
  from: SqlValue;
  to: SqlValue;
  createdAt?: SqlValue;
}

const scalar = (value: SqlValue) =>
  value && typeof value === "object" && "$integer" in value ? value.$integer : value;
const keyCell = (value: SqlValue): SqlValue =>
  typeof value === "number" && Number.isSafeInteger(value) ? { $integer: value.toString() } : value;
const equal = (left: unknown, right: unknown) =>
  canonicalContractJson(left) === canonicalContractJson(right);
const keyOf = (row: Row, columns: string[]) =>
  canonicalContractJson(columns.map(column => keyCell(row[column])));
function failure(message: string): never {
  throw new Error(`DEVICE_SYNC_METADATA_CONFLICT: ${message}`);
}

/** 只有声明为独立记录的表参与归并；未知事务仍由完整副本保全。 */
export function mergeMetadata(
  tables: readonly SyncTable[],
  current: Record<string, Row[]>,
  changes: readonly RowChange[],
  rules: Readonly<Record<string, MetadataRule>>
): { changes: RowChange[]; aliases: RowAlias[] } {
  const specs = new Map(tables.map(table => [table.name, table]));
  const initial = new Map<string, Map<string, Row>>();
  const working = new Map<string, Map<string, Row>>();
  for (const name of new Set(changes.map(change => change.table))) {
    const table = specs.get(name);
    if (!table || !Object.hasOwn(rules, name)) failure(`表 ${name} 未声明独立归并规则`);
    if (rules[name].columns && !equal([...rules[name].columns].sort(), [...table.columns].sort()))
      failure(`表 ${name} 的字段与归并契约不同`);
    const rows = new Map((current[name] ?? []).map(row => [keyOf(row, table.key), row]));
    initial.set(name, rows);
    working.set(name, new Map(rows));
  }
  // 折叠同一来源的连续修改，保留最早前镜像及最终后镜像。
  const folded = new Map<string, RowChange>();
  for (const change of changes) {
    const table = specs.get(change.table) ?? failure("同步表不存在");
    const row = change.after ?? change.before;
    if (
      !row ||
      !equal(
        change.key.map(keyCell),
        table.key.map(column => keyCell(row[column]))
      )
    )
      failure("行键与行镜像不一致");
    const identity = `${change.table}:${keyOf(row, table.key)}`;
    const before = folded.get(identity);
    if (before && !equal(before.after, change.before)) failure("来源事务前后镜像不连续");
    folded.set(identity, { ...change, before: before ? before.before : change.before });
  }

  const aliases: RowAlias[] = [];
  const references = (name: string): MetadataReference[] => [
    ...(specs.get(name)?.references ?? []),
    ...(rules[name].references ?? []),
  ];
  const aliasesByTable = new Map<string, Map<string, RowAlias>>();
  const addAlias = (alias: RowAlias) => {
    aliases.push(alias);
    let index = aliasesByTable.get(alias.table);
    if (!index) aliasesByTable.set(alias.table, (index = new Map()));
    index.set(String(scalar(alias.from)), alias);
  };
  const planned = [...folded.values()].filter(change => change.before || change.after);
  const rewrite = (table: string, input: Row | null): Row | null => {
    if (!input) return null;
    const result = { ...input };
    for (const ref of references(table)) {
      if (ref.when && scalar(input[ref.when.column]) !== ref.when.value) continue;
      const value = scalar(input[ref.column]);
      const text = String(value);
      if (ref.prefix && !text.startsWith(ref.prefix)) continue;
      const alias = aliasesByTable.get(ref.table)?.get(text.slice(ref.prefix?.length ?? 0));
      if (!alias) continue;
      result[ref.column] =
        typeof input[ref.column] === "string"
          ? `${ref.prefix ?? ""}${String(scalar(alias.to))}`
          : alias.to;
      if (ref.createdAt && alias.createdAt !== undefined) result[ref.createdAt] = alias.createdAt;
    }
    return result;
  };
  const normalized = (row: Row, rule: MetadataRule, table: SyncTable): Row => {
    const result = { ...row };
    for (const column of [...table.key, ...(rule.timestamps ?? [])]) delete result[column];
    for (const column of rule.json ?? []) {
      if (typeof result[column] !== "string") continue;
      try {
        result[column] = canonicalContractJson(JSON.parse(result[column] as string));
      } catch {
        failure(`表 ${table.name} 的 JSON 字段无效`);
      }
    }
    return result;
  };

  // 父对象先确定编号，引用边再按同一映射归并；契约不得存在映射依赖环。
  const pending = new Set(planned.map(change => change.table));
  while (pending.size) {
    const name = [...pending].find(name =>
      references(name).every(ref => ref.table === name || !pending.has(ref.table))
    );
    if (!name) failure("引用契约存在循环依赖");
    pending.delete(name);
    const table = specs.get(name) ?? failure("同步表不存在");
    const rule = rules[name];
    const rows = working.get(name) ?? failure("同步行集合不存在");
    const logical = rule.identity;
    const byIdentity = new Map<string, Row>();
    if (logical)
      for (const row of rows.values()) {
        const value = keyOf(row, logical);
        if (byIdentity.has(value)) failure(`表 ${name} 的逻辑身份不唯一`);
        byIdentity.set(value, row);
      }
    let nextId: bigint | undefined;
    for (const change of planned.filter(change => change.table === name)) {
      const before = rewrite(name, change.before);
      let after = rewrite(name, change.after);
      const candidate = after ?? before ?? failure("同步行镜像为空");
      let key = keyOf(candidate, table.key);
      let target = rows.get(key);
      if (after && logical) {
        const duplicate = byIdentity.get(keyOf(after, logical));
        if (duplicate && (!before || !target)) {
          target = duplicate;
          key = keyOf(duplicate, table.key);
        }
      }
      if (!before && after && target) {
        const sameIdentity = logical
          ? keyOf(target, logical) === keyOf(after, logical)
          : !rule.generatedKey;
        if (sameIdentity) {
          if (!equal(normalized(target, rule, table), normalized(after, rule, table)))
            failure(`表 ${name} 的同一对象存在不同内容`);
          if (table.key.length === 1 && !equal(target[table.key[0]], after[table.key[0]]))
            addAlias({
              table: name,
              from: after[table.key[0]],
              to: target[table.key[0]],
              createdAt: target.create_time,
            });
          continue;
        }
        if (!rule.generatedKey || table.key.length !== 1)
          failure(`表 ${name} 的主键被另一对象占用`);
        const column = table.key[0];
        if (nextId === undefined) {
          const reserved = [
            ...rows.values(),
            ...planned
              .filter(item => item.table === name)
              .flatMap(item => (item.after ? [item.after] : [])),
          ].map(row => scalar(row[column]));
          if (reserved.some(value => !/^\d+$/.test(String(value))))
            failure(`表 ${name} 的编号不能安全重分配`);
          nextId = reserved.reduce<bigint>((max, value) => {
            const number = BigInt(String(value));
            return number > max ? number : max;
          }, 0n);
        }
        nextId++;
        if (nextId > BigInt(Number.MAX_SAFE_INTEGER)) failure("对象编号超出安全范围");
        const to = { $integer: nextId.toString() };
        addAlias({ table: name, from: after[column], to, createdAt: after.create_time });
        after = { ...after, [column]: to };
        key = keyOf(after, table.key);
        target = undefined;
      }
      if (equal(target ?? null, before)) {
        if (before && logical) byIdentity.delete(keyOf(before, logical));
        if (after) {
          rows.set(key, after);
          if (logical) byIdentity.set(keyOf(after, logical), after);
        } else rows.delete(key);
      } else if (!equal(target ?? null, after)) {
        failure(`表 ${name} 的记录已并发修改`);
      }
    }
  }
  const opaque = (row: Row | null, columns: string[]) =>
    columns.some(column => {
      if (!row || row[column] === null) return false;
      try {
        const value = JSON.parse(String(row[column]));
        return value !== null && (typeof value !== "object" || Object.keys(value).length > 0);
      } catch {
        return true;
      }
    });
  if (
    aliases.length &&
    planned.some(change => {
      const columns = rules[change.table].opaque ?? [];
      return opaque(change.before, columns) || opaque(change.after, columns);
    })
  )
    failure("存在不透明载荷，不能证明编号映射不会破坏引用");

  const result: RowChange[] = [];
  for (const [name, rows] of working) {
    const table = specs.get(name) ?? failure("同步表不存在");
    const previous = initial.get(name) ?? failure("原始行集合不存在");
    for (const key of new Set([...previous.keys(), ...rows.keys()])) {
      const before = previous.get(key) ?? null;
      const after = rows.get(key) ?? null;
      if (equal(before, after)) continue;
      result.push({
        table: name,
        key: table.key.map(column => (after ?? before ?? failure("同步行镜像为空"))[column]),
        before,
        after,
      });
    }
  }
  return { changes: result, aliases };
}
