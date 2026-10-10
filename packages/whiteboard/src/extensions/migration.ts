import type { BoardElement } from "../types";
import type { WhiteboardElementDefinition } from "./api";

/** 已装配扩展声明的元素定义表：type → 定义（含版本与迁移函数） */
export type ElementDefinitionTable = ReadonlyMap<string, WhiteboardElementDefinition>;

export interface MigrationFailure {
  element: BoardElement;
  error: unknown;
}

export interface MigrationResult {
  children: BoardElement[];
  changed: boolean;
  failures: MigrationFailure[];
}

export interface MigrateElementTreeOptions {
  /**
   * 校验迁移产物（加载期使用）：返回中文失败原因表示产物不合规，
   * 该元素回退为迁移前原样并计入 failures；返回 null 表示通过。
   */
  validateMigrated?(element: BoardElement): string | null;
}

/** 元素数据侧版本：缺省或非法值（非正整数）按 1 处理 */
export function readElementSchemaVersion(element: BoardElement): number {
  const version = element.schemaVersion;
  return typeof version === "number" && Number.isInteger(version) && version > 0 ? version : 1;
}

/** 定义侧版本：装配校验保证为正整数，缺省 1 */
export function readDefinitionSchemaVersion(definition: WhiteboardElementDefinition): number {
  return definition.schemaVersion ?? 1;
}

/**
 * 对元素树执行版本迁移（纯函数）：
 * - 先递归迁移 children，再迁移元素自身；
 * - 自身迁移每步传入不含 children 的深拷贝，全部步骤成功后重新挂回迁移后的子树；
 * - 任一步抛错或改变 id/type → 该元素自身保持原字段原版本（子树仍用迁移结果）并记录失败；
 * - 传 validateMigrated 时迁移产物不合规同样按失败处理（仅加载期使用）；
 * - 无定义（未知/被拒类型）或版本不低于当前 → 原样；
 * - 无任何变化时返回原数组引用。
 */
export function migrateElementTree(
  children: BoardElement[],
  definitions: ElementDefinitionTable,
  options?: MigrateElementTreeOptions
): MigrationResult {
  const failures: MigrationFailure[] = [];
  const { children: migrated, changed } = migrateChildren(children, definitions, failures, options);
  return { children: migrated, changed, failures };
}

function migrateChildren(
  children: BoardElement[],
  definitions: ElementDefinitionTable,
  failures: MigrationFailure[],
  options?: MigrateElementTreeOptions
): { children: BoardElement[]; changed: boolean } {
  let changed = false;
  const migrated = children.map(element => {
    const result = migrateNode(element, definitions, failures, options);
    if (result !== element) changed = true;
    return result;
  });
  return changed ? { children: migrated, changed: true } : { children, changed: false };
}

function migrateNode(
  element: BoardElement,
  definitions: ElementDefinitionTable,
  failures: MigrationFailure[],
  options?: MigrateElementTreeOptions
): BoardElement {
  const childrenResult = element.children
    ? migrateChildren(element.children, definitions, failures)
    : undefined;
  const withMigratedChildren = childrenResult?.changed
    ? { ...element, children: childrenResult.children }
    : element;

  const definition = definitions.get(element.type);
  if (!definition) return withMigratedChildren;
  const current = readDefinitionSchemaVersion(definition);
  const version = readElementSchemaVersion(element);
  if (version >= current) return withMigratedChildren;

  try {
    let working = cloneWithoutChildren(element);
    for (let step = version; step < current; step++) {
      const migrate = definition.migrate?.[step];
      if (typeof migrate !== "function") {
        throw new Error(`缺少 migrate[${step}]，无法从 v${step} 升级`);
      }
      const next = migrate(working);
      if (
        !next ||
        typeof next !== "object" ||
        next.id !== element.id ||
        next.type !== element.type
      ) {
        throw new Error(`migrate[${step}] 返回的结果改变了元素 id 或 type`);
      }
      working = { ...next, schemaVersion: step + 1 };
    }
    const product = element.children ? { ...working, children: childrenResult!.children } : working;
    const invalidReason = options?.validateMigrated?.(product);
    if (invalidReason != null) {
      throw new Error(invalidReason);
    }
    return product;
  } catch (error) {
    failures.push({ element, error });
    return withMigratedChildren;
  }
}

function cloneWithoutChildren(element: BoardElement): BoardElement {
  const { children: _children, ...rest } = element;
  return structuredClone(rest) as BoardElement;
}
